# Account Manager (Auth DB) — Design and Usage

## Overview
- Separate Postgres database `omni_auth` for auth/session data (cookies, headers, user-agent).
- Access limited to `apps/api`; the crawler remains stateless and does not connect to the auth DB.
- No encryption yet. Short-lived Redis cache for session payloads.

## Schema
- Prisma schema: `apps/api/prisma/auth/schema.prisma`
- Model `AuthSession`:
  - `id`, `platform`, `account`, `host`, `userAgent`, `headers` (Json), `cookieJar` (Json),
    `status` (active|revoked), `createdAt`, `updatedAt`, `expiresAt`.
  - Indexes: `[platform, account, host]`, `[platform, account, host, status]`, `[expiresAt]`, `[account]`.
- Exactly one active session per `[platform, account, host]` is enforced in the service via transaction.

## Env Vars
- `AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/omni_auth`
- `AUTH_SERVICE_API_KEY=strong-service-key`
- `SCHED_ENABLE_AUTH_PURGE=true`
- `SCHED_AUTH_PURGE_EVERY_MS=900000`

## Endpoints (admin/service-only)
All endpoints require `Authorization: Bearer ${AUTH_SERVICE_API_KEY}`.

- `POST /accounts/sessions`
  - Body: `{ platform, account, host, userAgent, headers, cookieJar, expiresAt? }`
  - Behavior: revokes any existing active session for the identity; inserts a new active session.

- `GET /accounts/sessions?platform=&account=&host=`
  - Returns the active session payload (headers, cookies, user-agent, status, expiry).

- `POST /accounts/sessions/:id/revoke`
  - Marks a session revoked and invalidates cache.

- `DELETE /accounts/sessions/purge-expired`
  - Deletes expired sessions (worker also handles this periodically).

## Caching
- Redis key: `account:<platform>:<account>:<host>` (TTL ~5m with jitter).
- Implemented at `apps/api/src/features/accounts/account.cache.ts`.

## Workers
- Auth purge worker repeats every 15 minutes (configurable via env).
- Implementation at `apps/api/src/workers/auth-purge.worker.ts` and wired in `apps/api/src/workers/index.ts`.

## Migration Path
- `lib/pydoll.ts` remains as a temporary fallback and may be gated by a feature flag later.
- The orchestrator (API) can attach headers/cookies/UA to crawl jobs; the crawler stays stateless.

## Dev Notes
1. Create DB: `CREATE DATABASE omni_auth;`
2. Prisma (auth):
   - `bunx prisma migrate dev --schema apps/api/prisma/auth/schema.prisma`
   - `bunx prisma generate --schema apps/api/prisma/auth/schema.prisma`
3. Configure env vars for API: `AUTH_DATABASE_URL`, `AUTH_SERVICE_API_KEY`.
4. Run API and verify endpoints with a test token.
5. Do not log cookies/headers; errors are masked.

## Future Work
- Add field-level encryption and/or KMS integration.
- Add quotas, health checks, and audit logs.
- Consider a partial unique index for "one active per identity" via raw SQL migration.

