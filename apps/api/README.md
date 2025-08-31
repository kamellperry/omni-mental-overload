# Orchestrator — PyDoll Session Headers

This API service coordinates jobs and posts crawl tasks to the Python crawler. It also integrates with PyDoll to fetch durable, browser-derived headers for social platforms.

Overview
- PyDoll holds real browser contexts and exports host-ready headers per platform/account.
- The worker fetches headers from PyDoll, caches them briefly in Redis, and injects them into `crawl_config.headers` for crawler jobs.
- No schema or route shape changes are required; seeds remain `post`, `profile`, and `tag`.

Environment
- `PYDOLL_BASE_URL` — e.g. `http://pydoll:8080`
- `PYDOLL_AUTH_TOKEN` — bearer token for PyDoll API
- `IG_ACCOUNT_ID` — PyDoll account identifier for Instagram
- `CRAWLER_URL` — e.g. `http://crawler:8000`
- `HEADERS_TTL_S` — cache TTL (seconds), default 900
- `HEADERS_TTL_JITTER_PCT` — jitter percentage (0.3 default)
- `REDIS_URL` — `redis://localhost:6379` by default

Endpoints
- `POST /campaigns/:id/discover` — enqueues a crawl job with body:
  - `{ seed_type: 'post' | 'profile' | 'tag', seed_value: string, crawl_config?: {...} }`
  - The worker will fetch headers and post `crawl_config.headers` to the crawler with `mode: 'real'`.

Internals
- `src/lib/pydoll.ts` — PyDoll client with Redis caching (TTL + jitter)
- `src/worker.ts` — uses PyDoll to get headers and POSTs `/crawl/jobs` to the crawler

Security & Logging
- Never log header values or cookies; logs include only platform/account/host and status.
- Invalidate cached headers on 401/403 responses from the crawler endpoint.

