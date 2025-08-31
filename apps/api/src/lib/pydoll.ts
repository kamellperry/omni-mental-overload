import IORedis from 'ioredis';

type HeadersMap = Record<string, string>;

const TTL_DEFAULT_S = Number(process.env.HEADERS_TTL_S ?? 900);
const TTL_JITTER_PCT = Number(process.env.HEADERS_TTL_JITTER_PCT ?? 0.3);

function ttlWithJitter(): number {
  const base = TTL_DEFAULT_S;
  const jitter = (Math.random() * 2 - 1) * TTL_JITTER_PCT; // [-pct, +pct]
  const val = Math.max(60, Math.floor(base * (1 + jitter)));
  return val;
}

export async function getPlatformHeaders(
  redis: IORedis,
  platform: string,
  account: string,
  host: string,
): Promise<HeadersMap> {
  const key = `pydoll:headers:${platform}:${account}:${host}`;
  // Try cache first
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as HeadersMap;
    } catch {
      // fallthrough
    }
  }

  const baseUrl = process.env.PYDOLL_BASE_URL;
  const token = process.env.PYDOLL_AUTH_TOKEN;
  if (!baseUrl || !token) {
    throw new Error('PyDoll not configured (PYDOLL_BASE_URL/PYDOLL_AUTH_TOKEN)');
  }
  const url = `${baseUrl.replace(/\/$/, '')}/v1/session/${encodeURIComponent(
    platform,
  )}/${encodeURIComponent(account)}/headers?host=${encodeURIComponent(host)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`pydoll.headers.http_${res.status}`);
  }
  const data = (await res.json()) as HeadersMap;
  // Cache briefly (no secrets in logs or elsewhere)
  await redis.setex(key, ttlWithJitter(), JSON.stringify(data));
  return data;
}

export async function invalidatePlatformHeaders(
  redis: IORedis,
  platform: string,
  account: string,
  host: string,
) {
  const key = `pydoll:headers:${platform}:${account}:${host}`;
  await redis.del(key);
}

