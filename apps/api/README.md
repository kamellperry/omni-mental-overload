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
- `AUTH_SERVICE_API_KEY` — bearer token that protects admin endpoints
- `AUTH_ACCOUNT_ID` — AuthAccount.id used by the crawl worker to fetch bundles
- `AUTH_HOST` — `www.instagram.com` or `i.instagram.com` for the worker

Endpoints
- `POST /campaigns/:id/discover` — enqueues a crawl job with body:
  - `{ seed_type: 'post' | 'profile' | 'tag', seed_value: string, crawl_config?: {...}, accountId?: string, host?: 'www.instagram.com'|'i.instagram.com' }`
  - If `accountId`/`host` are provided, the worker uses them to fetch bundles; otherwise it falls back to `AUTH_ACCOUNT_ID`/`AUTH_HOST` envs. The worker injects headers/proxy and sets `mode: 'real'` when headers are present.
 - `POST /accounts/onboard` — create an account via PyDoll and persist mapping
   - Body: `{ platform:'instagram', account:string, credentials:{username,password}, proxy?:string, hosts?:['www.instagram.com'|'i.instagram.com'] }`
   - Returns: `{ accountId, providerAccountId, bundles? }` (bundles present when hosts provided)

Internals
- `src/lib/pydoll.ts` — PyDoll client with Redis caching (TTL + jitter)
- `src/worker.ts` — uses PyDoll to get headers and POSTs `/crawl/jobs` to the crawler

Development quickstart
- Copy example envs: `cp .env.example .env` and adjust values
- Start backing services: `docker compose up -d postgres redis`
- Migrate Prisma (main + auth):
  - `bunx prisma migrate dev --name init`
  - `AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omni_auth bunx prisma migrate dev --schema prisma/auth/schema.prisma --name init_auth_session`
  - `AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omni_auth bunx prisma generate --schema prisma/auth/schema.prisma`
- Run API + workers: `bun run dev & bun run queue:worker`

Security & Logging
- Never log header values or cookies; logs include only platform/account/host and status.
- Invalidate cached headers on 401/403 responses from the crawler endpoint.
