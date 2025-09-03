# PyDoll Bundle Contract (v1)

This document defines the interface between PyDoll (session provider) and the Account Manager (our API) for minting and serving host‑scoped session bundles used by the crawler.

Status: MVP, stable. Additive changes only (new optional fields). Breaking changes require version bump.

## Purpose

- PyDoll owns login/refresh mechanics and returns durable, host‑ready session artifacts.
- Account Manager stores the bundle (AuthSession), caches it briefly, and serves it to the orchestrator.
- Orchestrator forwards the bundle to the crawler as `crawl_config.headers` (and proxy), making authenticated, browser‑like requests.

## Refresh Endpoint (PyDoll)

- Method: `POST`
- URL: `{PYDOLL_BASE_URL}/v1/accounts/{providerAccountId}/sessions/refresh?host={HOST}`
  - Path params: `providerAccountId` (PyDoll’s canonical account id)
  - Query params:
    - `host`: the door to mint/refresh for, e.g. `www.instagram.com` or `i.instagram.com`
- Headers:
  - `Authorization: Bearer {PYDOLL_AUTH_TOKEN}`
  - `Content-Type: application/json`
- Body (JSON):
  - Optional: `{ "force": true }` to rotate even if PyDoll has a valid session. Omit otherwise.
- Responses:
  - 200 JSON (see schema below)
  - 4xx on auth/validation; 5xx on provider error

## Response Schema (JSON)

Top‑level (all platforms/hosts):
- `userAgent: string` — browser UA used to mint the session
- `headers: Record<string,string>` — host‑ready non‑cookie headers (see per‑host expectations)
- `cookieJar: object | array` — canonical cookie container for the host, not a raw `Cookie` header
- `proxy?: string` — proxy to use for this session; MUST be standard URL `scheme://user:pass@host:port`
- `expiresAt: string` — ISO‑8601 UTC timestamp
- `providerSessionId?: string` — optional provider identifier for correlation/debug

Notes:
- Do NOT include a raw `Cookie` header inside `headers`; the Account Manager will derive it from `cookieJar`.
- Unknown fields are preserved and ignored by the Account Manager.

## Per‑Host Expectations

### Web (www.instagram.com)

Required (bundle or derived):
- `userAgent`
- `cookieJar` containing at least `sessionid` and `csrftoken`

Strongly recommended (from provider):
- `headers.X-IG-WWW-Claim` — claim token (a.k.a. `X-IG-Set-WWW-Claim` from login flows)
- `headers.X-Instagram-AJAX` — rollout hash

Recommended (defaulted by Account Manager if missing):
- `headers.x-ig-app-id = 936619743392459` (web app id)
- `headers.X-ASBD-ID = 359341` (or env `X_ASBD_ID`)
- Browser scaffolding (added if missing):
  - `headers.X-Requested-With = XMLHttpRequest`
  - `headers.Origin = https://www.instagram.com`
  - `headers.Referer = https://www.instagram.com/`
  - `headers.Accept = */*`
  - `headers.Accept-Language = en-US,en;q=0.9`
  - `headers.Accept-Encoding = gzip, deflate, br`
  - `headers.Connection = keep-alive`

Derived automatically by Account Manager when serving:
- `headers.Cookie` constructed from `cookieJar`
- `headers.X-CSRFToken` derived from `csrftoken` if not already present
- `headers.User-Agent` set to `userAgent` if missing

### Mobile (i.instagram.com)

Required:
- `userAgent`
- `cookieJar` (if session relies on cookies)

Recommended:
- Provide any mobile‑required tokens in `headers` (e.g., app id if needed). The Account Manager will not inject web‑only headers for mobile hosts.

## Proxy

- PyDoll MUST return a standard proxy URL: `scheme://user:password@host:port`.
- The Account Manager stores a normalized snapshot on the session and passes it to the crawler unchanged.

## Example — Web Bundle (www.instagram.com)

```
{
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...",
  "headers": {
    "x-ig-app-id": "936619743392459",
    "X-IG-WWW-Claim": "hmac.ARabcdefgh...",
    "X-Instagram-AJAX": "1012345678",
    "X-ASBD-ID": "359341"
  },
  "cookieJar": [
    { "name": "sessionid", "value": "...", "domain": ".instagram.com", "path": "/" },
    { "name": "csrftoken", "value": "...", "domain": ".instagram.com", "path": "/" },
    { "name": "ds_user_id", "value": "...", "domain": ".instagram.com", "path": "/" }
  ],
  "proxy": "http://user:pass@proxy.example.com:8080",
  "expiresAt": "2025-01-31T12:00:00Z",
  "providerSessionId": "ps_abc123"
}
```

The Account Manager will add (if missing): `Cookie`, `X-CSRFToken`, `User-Agent`, and browser scaffolding headers when serving this bundle.

## Example — Mobile Bundle (i.instagram.com)

```
{
  "userAgent": "Instagram 273.0.0.16.70 (iPhone; iOS 16_3; en_US) AppleWebKit/420+",
  "headers": {
    "x-ig-app-id": "124024574287414"
  },
  "cookieJar": { "sessionid": "...", "csrftoken": "..." },
  "proxy": "http://user:pass@proxy.example.com:8080",
  "expiresAt": "2025-01-31T12:00:00Z"
}
```

## Error Semantics

- 401/403 from PyDoll → the Account Manager returns an error (`pydoll.http_401/403`).
- 5xx from PyDoll → `pydoll.http_5xx` error.
- Invalid payload (missing required fields) → `pydoll.bad_payload` (502).

## Security & Logging

- Do not include raw `Cookie` in `headers`.
- The Account Manager never logs cookie values or secrets; logs include only ids and event codes.

## Versioning & Compatibility

- This is v1. Fields may be added; existing fields keep semantics.
- Unknown fields are ignored by the Account Manager and preserved when possible.

## Testing Notes

- Local mock provided via `docker compose up -d pydoll` (see `docker-compose.yml`).
- For manual testing, any valid shape that includes `userAgent`, `cookieJar` with `sessionid`/`csrftoken`, and a standard `proxy` will be stored and served.

