import type IORedis from 'ioredis';
import { z } from 'zod';
import { ACCOUNT_MANAGEMENT_CONFIG } from './account-management-config';
import {
  cacheGetSession,
  cacheInvalidateSession,
  cachePutSession,
  type SessionCachePayload,
} from './account.cache';
import {
  createSessionSchema,
  getActiveSessionQuerySchema,
  revokeSessionSchema,
  sessionOutputSchema,
} from './session.schema';
import type { AuthDB } from '../../db/auth-db';
import * as repo from './session.repo';

type Identity = z.infer<typeof getActiveSessionQuerySchema>;
type CreateInput = z.infer<typeof createSessionSchema>;
type RevokeInput = z.infer<typeof revokeSessionSchema>;
type SessionOutput = z.infer<typeof sessionOutputSchema>;

type Deps = {
  db: AuthDB; // reserved for future injection; repo uses getAuthDb() pattern
  redis: IORedis;
  now?: () => Date;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  const { maxRetries, retryDelayMs } = ACCOUNT_MANAGEMENT_CONFIG.db;
  let lastErr: unknown;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < maxRetries - 1) await sleep(retryDelayMs);
    }
  }
  throw lastErr;
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  const toMs = ACCOUNT_MANAGEMENT_CONFIG.db.queryTimeout;
  return await Promise.race<T>([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('am.query_timeout')), toMs)),
  ]);
}

function toOutput(rec: repo.AuthSessionRecord): SessionOutput {
  return {
    id: rec.id,
    platform: rec.platform,
    account: rec.account,
    host: rec.host,
    userAgent: rec.userAgent,
    headers: rec.headers as Record<string, string>,
    cookieJar: rec.cookieJar as Record<string, unknown> | unknown[],
    status: rec.status,
    createdAt: new Date(rec.createdAt),
    updatedAt: new Date(rec.updatedAt),
    expiresAt: new Date(rec.expiresAt),
  };
}

function toCachePayload(out: SessionOutput): SessionCachePayload {
  return {
    platform: out.platform,
    account: out.account,
    host: out.host,
    userAgent: out.userAgent,
    headers: out.headers,
    cookieJar: out.cookieJar,
    status: out.status,
    updatedAt: out.updatedAt.toISOString(),
    expiresAt: out.expiresAt.toISOString(),
  };
}

function defaultExpiry(now: Date): Date {
  const days = ACCOUNT_MANAGEMENT_CONFIG.limits.cookieRefreshIntervalDays;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function createSession(deps: Deps, input: unknown): Promise<SessionOutput> {
  const parsed = createSessionSchema.parse(input) as CreateInput;
  const now = deps.now ? deps.now() : new Date();
  const expiresAt = parsed.expiresAt ?? defaultExpiry(now);

  const rec = await withTimeout(
    withRetries(() =>
      repo.createAndActivateSession({
        platform: parsed.platform,
        account: parsed.account,
        host: parsed.host,
        userAgent: parsed.userAgent,
        headers: parsed.headers,
        cookieJar: parsed.cookieJar,
        expiresAt,
      }),
    ),
  );

  const out = toOutput(rec);
  await cachePutSession(deps.redis, toCachePayload(out));
  return out;
}

export async function getActiveSession(deps: Deps, identityInput: unknown): Promise<SessionOutput | null> {
  const identity = getActiveSessionQuerySchema.parse(identityInput) as Identity;

  const cached = await cacheGetSession(deps.redis, identity);
  if (cached) {
    return {
      id: 'cached',
      platform: identity.platform,
      account: identity.account,
      host: identity.host,
      userAgent: cached.userAgent,
      headers: cached.headers,
      cookieJar: cached.cookieJar,
      status: cached.status,
      createdAt: new Date(cached.updatedAt),
      updatedAt: new Date(cached.updatedAt),
      expiresAt: new Date(cached.expiresAt),
    } as SessionOutput;
  }

  const rec = await withTimeout(withRetries(() => repo.findActiveSession(identity)));
  if (!rec) return null;

  const out = toOutput(rec);
  await cachePutSession(deps.redis, toCachePayload(out));
  return out;
}

export async function revokeSession(deps: Deps, input: unknown): Promise<SessionOutput> {
  const { id } = revokeSessionSchema.parse(input) as RevokeInput;
  const rec = await withTimeout(withRetries(() => repo.revokeById(id)));
  const out = toOutput(rec);
  await cacheInvalidateSession(deps.redis, { platform: out.platform, account: out.account, host: out.host });
  return out;
}

export async function purgeExpired(deps: Deps): Promise<number> {
  const now = deps.now ? deps.now() : new Date();
  const count = await withTimeout(withRetries(() => repo.purgeExpired(now)));
  return count;
}

