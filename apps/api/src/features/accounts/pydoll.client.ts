import { AppError } from '../../lib/errors';

export type PyDollBundle = {
  userAgent: string;
  headers: Record<string, string>;
  cookieJar: Record<string, unknown> | unknown[];
  proxy?: string | null;
  expiresAt: string; // ISO
  providerSessionId?: string | null;
};

function classify(e: unknown): string {
  const s = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (s.includes('401')) return 'unauthorized';
  if (s.includes('403')) return 'forbidden';
  if (s.includes('429')) return 'rate_limited';
  if (s.includes('timeout')) return 'timeout';
  return 'unknown';
}

export async function refreshSession(
  providerAccountId: string,
  host: string,
  opts?: { force?: boolean },
): Promise<PyDollBundle> {
  const base = process.env.PYDOLL_BASE_URL;
  const token = process.env.PYDOLL_AUTH_TOKEN;
  if (!base || !token) throw new AppError('pydoll.misconfigured', 'PyDoll not configured', 500);
  const url = `${base.replace(/\/$/, '')}/v1/accounts/${encodeURIComponent(providerAccountId)}/sessions/refresh?host=${encodeURIComponent(host)}`;
  const body = opts?.force ? { force: true } : {};
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!r.ok) {
    throw new AppError(`pydoll.http_${r.status}`, 'PyDoll refresh failed', r.status, json);
  }
  const data = json as PyDollBundle;
  // Basic shape checks (we trust provider specifics)
  if (!data || typeof data.userAgent !== 'string' || typeof data.headers !== 'object' || !data.cookieJar) {
    throw new AppError('pydoll.bad_payload', 'PyDoll returned invalid session payload', 502);
  }
  return data;
}

export type PyDollCreateAccountInput = {
  platform: 'instagram';
  credentials: { username: string; password: string };
  proxy?: string | null;
};

export type PyDollCreateAccountOutput = {
  id: string; // providerAccountId
};

export async function createAccount(input: PyDollCreateAccountInput): Promise<PyDollCreateAccountOutput> {
  const base = process.env.PYDOLL_BASE_URL;
  const token = process.env.PYDOLL_AUTH_TOKEN;
  if (!base || !token) throw new AppError('pydoll.misconfigured', 'PyDoll not configured', 500);
  const url = `${base.replace(/\/$/, '')}/v1/accounts`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      platform: input.platform,
      credentials: input.credentials,
      proxy: input.proxy ?? undefined,
    }),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!r.ok) {
    throw new AppError(`pydoll.http_${r.status}`, 'PyDoll create account failed', r.status, json);
  }
  const data = json as { id?: unknown } | null;
  const id = data && typeof data.id === 'string' ? data.id : null;
  if (!id) throw new AppError('pydoll.bad_payload', 'PyDoll returned invalid account payload', 502);
  return { id };
}
