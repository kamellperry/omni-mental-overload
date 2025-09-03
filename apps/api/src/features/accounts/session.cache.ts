import type IORedis from 'ioredis';

function ttlWithJitter(base: number, pct = 0.3): number {
  const jitter = (Math.random() * 2 - 1) * pct;
  return Math.max(30, Math.floor(base * (1 + jitter)));
}

export type SessionBundle = {
  userAgent: string;
  headers: Record<string, string>;
  cookieJar: Record<string, unknown> | unknown[];
  proxy?: string | null;
  expiresAt: string; // ISO
};

export function key(accountId: string, host: string): string {
  return `am:sess:${accountId}:host:${host}`;
}

export async function put(redis: IORedis, accountId: string, host: string, bundle: SessionBundle) {
  const ttl = ttlWithJitter(600); // 10m base for MVP
  await redis.setex(key(accountId, host), ttl, JSON.stringify(bundle));
}

export async function get(redis: IORedis, accountId: string, host: string): Promise<SessionBundle | null> {
  const raw = await redis.get(key(accountId, host));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionBundle;
  } catch {
    return null;
  }
}

export async function invalidate(redis: IORedis, accountId: string, host: string) {
  await redis.del(key(accountId, host));
}

