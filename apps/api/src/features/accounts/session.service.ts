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
import * as accounts from './account.repo';
import * as sessCache from './session.cache';
import { refreshSession as pydollRefresh } from './pydoll.client';

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

// --- Host-scoped, accountId-based bundle serving ---

const IG_HOSTS = new Set(['www.instagram.com', 'i.instagram.com']);

export function assertValidHost(host: string): void {
  if (!IG_HOSTS.has(host)) {
    throw new Error('invalid_host');
  }
}

export type SessionBundle = {
  userAgent: string;
  headers: Record<string, string>;
  cookieJar: Record<string, unknown> | unknown[];
  proxy?: string | null;
  expiresAt: string; // ISO
};

function cookieHeaderFromJar(jar: Record<string, unknown> | unknown[]): string | null {
  try {
    if (Array.isArray(jar)) {
      const parts: string[] = [];
      for (const it of jar) {
        if (it && typeof it === 'object' && 'name' in it && 'value' in it) {
          const name = String((it as any).name);
          const value = String((it as any).value);
          if (name) parts.push(`${name}=${value}`);
        }
      }
      return parts.length ? parts.join('; ') : null;
    }
    // object map form { name: value }
    const parts = Object.entries(jar as Record<string, unknown>)
      .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
      .map(([k, v]) => `${k}=${String(v)}`);
    return parts.length ? parts.join('; ') : null;
  } catch {
    return null;
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const needle = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === needle) return true;
  return false;
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  // Preserve existing casing if present; else set with given name
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      headers[k] = value;
      return;
    }
  }
  headers[name] = value;
}

function enrichHeadersForHost(
  host: string,
  headers: Record<string, string>,
  jar: Record<string, unknown> | unknown[],
  userAgent: string,
): Record<string, string> {
  const out = { ...headers };

  // Always ensure User-Agent is set to the session UA
  if (!hasHeader(out, 'User-Agent')) setHeader(out, 'User-Agent', userAgent);

  // Ensure Cookie exists (caller likely set this already from jar)
  // Add X-CSRFToken if cookie present and header missing
  try {
    const cookie = cookieHeaderFromJar(jar);
    if (cookie && !hasHeader(out, 'Cookie')) setHeader(out, 'Cookie', cookie);
    if (!hasHeader(out, 'X-CSRFToken')) {
      // lightweight parse for csrftoken
      const parts = (cookie ?? '').split(';');
      for (const p of parts) {
        const [k, v] = p.trim().split('=');
        if ((k || '').toLowerCase() === 'csrftoken' && v) {
          setHeader(out, 'X-CSRFToken', v);
          break;
        }
      }
    }
  } catch {
    // ignore
  }

  // Web host defaults (www)
  if (host === 'www.instagram.com') {
    // Required/commonly used tokens
    if (!hasHeader(out, 'x-ig-app-id')) setHeader(out, 'x-ig-app-id', '936619743392459');
    if (!hasHeader(out, 'X-ASBD-ID')) setHeader(out, 'X-ASBD-ID', process.env.X_ASBD_ID || '359341');
    // X-IG-WWW-Claim and X-Instagram-AJAX should come from provider; do not synthesize.

    // Browsery headers for web XHR
    if (!hasHeader(out, 'X-Requested-With')) setHeader(out, 'X-Requested-With', 'XMLHttpRequest');
    if (!hasHeader(out, 'Origin')) setHeader(out, 'Origin', 'https://www.instagram.com');
    if (!hasHeader(out, 'Referer')) setHeader(out, 'Referer', 'https://www.instagram.com/');
    if (!hasHeader(out, 'Accept')) setHeader(out, 'Accept', '*/*');
    if (!hasHeader(out, 'Accept-Language')) setHeader(out, 'Accept-Language', 'en-US,en;q=0.9');
    if (!hasHeader(out, 'Accept-Encoding')) setHeader(out, 'Accept-Encoding', 'gzip, deflate, br');
    if (!hasHeader(out, 'Connection')) setHeader(out, 'Connection', 'keep-alive');
  }

  // Mobile host (i.instagram.com): we intentionally do not inject web-only headers
  return out;
}

function normalizeProxyURL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const val = String(raw).trim();
  if (!val) return null;
  try {
    const u = new URL(val);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // Already a valid URL (standard form). Return as-is.
      return u.toString();
    }
  } catch {
    // fallthrough to vendor pattern
  }
  // Vendor pattern: scheme://host:port:user:password_with_suffix
  const m = /^(https?:)\/\/([^:\/]+):(\d+):([^:]+):(.+)$/.exec(val);
  if (m) {
    const scheme = m[1];
    const host = m[2];
    const port = m[3];
    const user = m[4];
    const pass = m[5];
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`;
    return `${scheme}//${auth}@${host}:${port}`;
  }
  // As a last resort, return the original string (caller may still handle it)
  return val;
}

export async function getActiveBundle(
  redis: IORedis,
  accountId: string,
  host: string,
): Promise<SessionBundle | null> {
  assertValidHost(host);
  const cached = await sessCache.get(redis, accountId, host);
  if (cached) return cached;
  const rec = await repo.findActiveByAccountHost(accountId, host);
  if (!rec) return null;
  const headers = (rec.headers as Record<string, string>) || {};
  const jar = (rec.cookieJar as Record<string, unknown> | unknown[]) || [];
  const mergedHeaders = enrichHeadersForHost(host, headers, jar, rec.userAgent);
  const bundle: SessionBundle = {
    userAgent: rec.userAgent,
    headers: mergedHeaders,
    cookieJar: jar,
    proxy: normalizeProxyURL(rec.proxy ?? null),
    expiresAt: rec.expiresAt.toISOString(),
  };
  await sessCache.put(redis, accountId, host, bundle);
  return bundle;
}

export async function refreshBundle(
  redis: IORedis,
  accountId: string,
  host: string,
  opts?: { force?: boolean },
): Promise<SessionBundle> {
  assertValidHost(host);
  const acc = await accounts.findById(accountId);
  if (!acc) throw new Error('account_not_found');
  const bundle = await pydollRefresh(acc.providerAccountId, host, { force: opts?.force });
  // Persist
  const proxy = bundle.proxy ?? acc.proxy ?? null;
  const normalizedProxy = normalizeProxyURL(proxy);
  const expiresAt = new Date(bundle.expiresAt);
  const created = await repo.createActiveForAccountHost({
    accountId,
    platform: acc.platform,
    account: acc.account,
    host,
    userAgent: bundle.userAgent,
    headers: bundle.headers,
    cookieJar: bundle.cookieJar,
    proxy: normalizedProxy,
    providerSessionId: bundle.providerSessionId ?? null,
    expiresAt,
  });
  // Build merged headers with required defaults for host
  const mergedHeaders = enrichHeadersForHost(host, bundle.headers, bundle.cookieJar, bundle.userAgent);
  const out: SessionBundle = {
    userAgent: bundle.userAgent,
    headers: mergedHeaders,
    cookieJar: bundle.cookieJar,
    proxy: normalizedProxy,
    expiresAt: created.expiresAt.toISOString(),
  };
  await sessCache.put(redis, accountId, host, out);
  return out;
}

export async function upsertManual(
  redis: IORedis,
  input: {
    accountId: string;
    platform: string;
    account: string;
    host: string;
    userAgent: string;
    headers: Record<string, string>;
    cookieJar: Record<string, unknown> | unknown[];
    proxy?: string | null;
    expiresAt: Date;
  },
): Promise<SessionBundle> {
  assertValidHost(input.host);
  const created = await repo.createActiveForAccountHost({
    accountId: input.accountId,
    platform: input.platform,
    account: input.account,
    host: input.host,
    userAgent: input.userAgent,
    headers: input.headers,
    cookieJar: input.cookieJar,
    proxy: normalizeProxyURL(input.proxy ?? null),
    expiresAt: input.expiresAt,
    providerSessionId: null,
  });
  const mergedHeaders = enrichHeadersForHost(input.host, input.headers, input.cookieJar, input.userAgent);
  const out: SessionBundle = {
    userAgent: created.userAgent,
    headers: mergedHeaders,
    cookieJar: input.cookieJar,
    proxy: normalizeProxyURL(input.proxy ?? null),
    expiresAt: created.expiresAt.toISOString(),
  };
  await sessCache.put(redis, input.accountId, input.host, out);
  return out;
}
