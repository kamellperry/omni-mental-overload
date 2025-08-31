import type IORedis from 'ioredis';
import { ACCOUNT_MANAGEMENT_CONFIG, getAccountCacheKey } from './account-management-config';

export type SessionCachePayload = {
  platform: string;
  account: string;
  host: string;
  userAgent: string;
  headers: Record<string, string>;
  cookieJar: Record<string, unknown> | unknown[];
  expiresAt: string; // ISO8601
  status: 'active' | 'revoked';
  updatedAt: string; // ISO8601
};

function ttlWithJitter(base: number, jitterPct = 0.3): number {
  const jitter = (Math.random() * 2 - 1) * jitterPct;
  return Math.max(30, Math.floor(base * (1 + jitter)));
}

export async function cachePutSession(redis: IORedis, payload: SessionCachePayload): Promise<void> {
  const key = getAccountCacheKey({ platform: payload.platform, account: payload.account, host: payload.host });
  const ttl = ttlWithJitter(ACCOUNT_MANAGEMENT_CONFIG.cache.ttl.account);
  await redis.setex(key, ttl, JSON.stringify(payload));
}

export async function cacheGetSession(
  redis: IORedis,
  identity: { platform: string; account: string; host: string },
): Promise<SessionCachePayload | null> {
  const key = getAccountCacheKey(identity);
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionCachePayload;
  } catch {
    return null;
  }
}

export async function cacheInvalidateSession(
  redis: IORedis,
  identity: { platform: string; account: string; host: string },
): Promise<void> {
  const key = getAccountCacheKey(identity);
  await redis.del(key);
}

