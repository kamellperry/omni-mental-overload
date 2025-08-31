# Account Manager-Based Auth Integration Plan (PyDoll, No-Lease Variant)

Purpose: centralize social authentication and session handling in a dedicated Account Manager (PyDoll‑backed), keep the crawler stateless, and avoid fast per‑request lookups. This plan introduces no public API changes and no schema changes in the existing app. All secrets (cookies, tokens, UA) live in the Account Manager’s storage; orchestrator fetches headers once per crawl and injects them into the crawler.

## Goals

- Centralize sessions: one service (Account Manager) owns login, refresh, and storage of cookies + UA + platform tokens (via PyDoll/CDP).
- Keep crawler stateless: receives host‑ready headers once per job; never logs in; never stores secrets.
- Keep orchestrator simple: selects account, fetches headers once per job; only re‑fetches on rare expiry.
- No public API or DB schema changes to this project.

## Non‑Goals

- No leases, no per‑request header fetches from the crawler in this phase.
- No migration of session data into the app’s Prisma schema (Account Manager stores its own secrets).
- No new seed types or crawler routes.

## Architecture Overview

- Control Plane
  - Account Manager (PyDoll‑backed): stores encrypted session bundles per platform/account (cookies, UA, platform tokens); exposes private endpoints to save session, export host‑ready headers, refresh, and report status.
  - Orchestrator (Node): chooses platform/account; fetches headers once before a crawl; injects headers into `crawl_config.headers`; on “auth expired” signal, asks Account Manager to refresh and retries once.

- Data Plane
  - Crawler (Python/FastAPI): uses provided headers; adds safe web‑only defaults; performs crawl; upserts to DB; on 401/403/soft‑limit logs an error class (e.g., `auth_expired`, `rate_limited`) so the orchestrator can react.

## Data Flow

1) Onboarding / Login (one‑time per account)
- PyDoll automates login for a social account (IG today) via CDP.
- Account Manager extracts cookies + UA + platform tokens and saves a “session bundle”.

2) Crawl Start (typical)
- Orchestrator selects an account for the platform (e.g., IG account A).
- Orchestrator calls Account Manager: GET headers for host `www.instagram.com`.
- Orchestrator calls crawler `POST /crawl/jobs` with `crawl_config.mode = "real"` and `crawl_config.headers = <headers>`.

3) Rare Expiry / Soft Limit
- Crawler encounters 401/403 or “Please wait…” soft‑rate‑limit.
- Crawler logs error class (e.g., `auth_expired`) and returns failure.
- Orchestrator sees the failure, POSTs Account Manager `/refresh`, GETs headers again, and re‑runs the crawl once with backoff.

## Account Manager (Private) Endpoints

Note: separate service; protect with Bearer token; encrypt session storage at rest. These endpoints do not change public app APIs.

- POST `/v1/accounts/:platform/:account/session`
  - Saves/updates a session bundle: cookies map, UA string, extras JSON (platform tokens), timestamps.

- GET `/v1/accounts/:platform/:account/headers?host=<hostname>`
  - Returns host‑ready headers for the given host.
  - Include: `Cookie`, `User-Agent` and platform tokens (IG: `X-CSRFToken`, `X-IG-WWW-Claim`, `X-ASBD-ID`, `X-Instagram-AJAX`, `x-ig-app-id:936619743392459`).
  - Exclude: `Referer`, `Origin`, `X-Requested-With` (crawler adds those for `www.instagram.com`).

- POST `/v1/accounts/:platform/:account/refresh`
  - Uses PyDoll/CDP to refresh cookies/tokens; overwrites stored bundle.

- GET `/v1/accounts/:platform/:account/status`
  - Returns health, `last_refreshed_at`, `expires_at` (best‑effort), and notes.

### Account Manager Storage (Service‑Local)
- Secrets store (DB/object store):
  - `platform`, `account_alias`
  - `cookies` (JSON), `user_agent` (string)
  - `extras` (JSON) e.g., IG claim/asbd/rollout
  - `last_refreshed_at`, optional `expires_at`, `status`
- Security: AES/KMS or libsodium; never log cookie values; access restricted by IP/role.

## Orchestrator Changes (No Public API Changes)

- Add small client module (e.g., `apps/api/src/lib/accountManager.ts`) to call Account Manager endpoints with auth.
- In the crawl worker:
  - Pick platform/account (e.g., round‑robin from `IG_ACCOUNT_POOL`).
  - GET headers from Account Manager for `www.instagram.com`.
  - POST crawler `/crawl/jobs` with the existing payload + `crawl_config.mode="real"` and `crawl_config.headers=<headers>`.
  - On failure with `auth_expired` (or similar):
    - POST `/refresh` for that account.
    - GET headers again and retry the crawl once with backoff.
  - Optional caching: memoize headers in process or Redis (TTL 10–30 min with jitter) to reduce Account Manager load.

- Config (examples):
  - `ACCOUNT_MANAGER_BASE_URL`, `ACCOUNT_MANAGER_AUTH`
  - `IG_ACCOUNT_POOL` (CSV)
  - `HEADERS_TTL_S`, `HEADERS_TTL_JITTER_PCT` (if caching)

## Crawler Notes (No API Changes)

- Continue to use `crawl_config.headers` as today.
- `http_headers` keeps behavior:
  - Add `X-Requested-With`, `Origin`, `Referer` only for `www.instagram.com`.
  - Mirror `csrftoken` → `X‑CSRFToken` if missing.
  - Preserve IG tokens; strip nothing else; never log headers/cookies.
- Error classification: on 401/403, classify as `auth_expired`; on `429` or “Please wait…”, classify as `rate_limited`.

## Error Handling & Backoff

- `auth_expired` → Orchestrator triggers Account Manager `/refresh`, re‑fetches headers, and retries once with a small backoff (e.g., 2–5s).
- `rate_limited` → increase delay/backoff; optionally schedule later or rotate accounts.
- Hard failures after one refresh attempt → surface to job status; optional account rotation policy.

## Performance Considerations

- Fetch headers once per crawl job; not per request. Ideal for long‑lived sessions.
- Optional short‑TTL caching in orchestrator (Redis/in‑process) to reduce Account Manager calls on bursts.
- Keep crawler per‑domain concurrency caps (2–3) and retry/backoff as implemented.

## Security Considerations

- Secrets only in Account Manager storage; encrypt at rest.
- Orchestrator fetches headers and sends them directly to crawler over TLS; do not write headers to DB or logs.
- Crawler logs contain only endpoint host/path and error class; never log header values.

## Implementation Plan (Phased)

- Phase 0 (Scaffold)
  - Account Manager: implement endpoints and storage; integrate PyDoll for login/refresh; confirm header builder per host.
  - Orchestrator: add Account Manager client; modify crawl worker to fetch headers → call crawler; handle `auth_expired` refresh+retry.
  - Crawler: verify error classification and current header builder behavior.

- Phase 1 (Ops & Safety)
  - Add in‑process/Redis header caching with TTL+jitter.
  - Add simple per‑account concurrency caps in orchestrator (avoid overwhelming one account).
  - Add observability: logs for headers.get/refresh; metrics for failures.

- Phase 2 (Scale & Multi‑Platform)
  - Extend Account Manager to support additional platforms (e.g., Facebook) with the same contract.
  - Add provider modules in crawler per platform when needed; reuse the same orchestrator injection flow.

## Ownership & File Touch Points

- Account Manager (new service)
  - Endpoints: `/v1/accounts/:platform/:account/session|headers|refresh|status`
  - Storage model and encryption
  - PyDoll integration for login/refresh

- Orchestrator (apps/api)
  - `src/lib/accountManager.ts` (new)
  - `src/workers/crawl.worker.ts` (fetch headers, call crawler, handle refresh+retry)
  - Optional: Redis caching in `accountManager.ts`

- Crawler (apps/crawler)
  - No new routes; confirm `http_headers` behavior and error classification

## Testing Plan

- Unit (orchestrator):
  - Account Manager client happy path and error paths; header caching; refresh+retry once on `auth_expired`.
- Unit (crawler):
  - Header builder preserves tokens; adds web‑only headers only for `www`; never logs secrets.
  - Error classification for 401/403/429.
- Integration (local):
  - Run Account Manager mock (or real PyDoll) → orchestrator → crawler → DB.
  - Trigger normal crawl (post/tag) and verify upserts.
  - Force `auth_expired` to validate refresh flow.
- Chaos:
  - Force soft‑rate‑limit and observe backoff behavior.

## Open Questions

- Account selection policy: round‑robin or sticky per campaign? Any per‑account concurrency caps?
- Header caching: enable now or defer until load warrants it?
- Exact PyDoll flows for refresh triggers and token capture (claim/asbd/rollout) — any edge cases to bake in?

---

This plan keeps the crawler API/data model unchanged, centralizes sessions in a dedicated Account Manager, and minimizes round‑trips by fetching headers once per crawl and only refreshing on rare expiry. It also sets a clean path to multi‑platform support with the same contract.

