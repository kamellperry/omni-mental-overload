export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    const text = await r.text();
    let json: unknown;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    if (!r.ok) {
      const msg = typeof json === 'object' && json && 'message' in (json as any) ? (json as any).message : r.statusText;
      throw new Error(`HTTP ${r.status} ${msg}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

