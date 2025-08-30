# Real Comments Crawler v1 — PRD

Version: 1.0

## 1. Problem & Goal

- Today the crawler accepts jobs and writes mock profiles to Postgres. We now need real functionality.
- Goal: start from a seed (a post/shortcode or a hashtag), fetch real commenters from Instagram, turn commenters into profiles, and upsert them into our existing tables.
- Prepare a small provider/wrapper layer so the same strategies can work for other platforms later (Instagram first).

## 2. Principles

- Keep API/orchestrator separate. The crawler exposes only `POST /crawl/jobs`.
- No schema changes. Write to `"ProfileRaw"` and `"ProfileFeatures"` only.
- Idempotent writes: compute `content_hash`, copy as `versionHash`, skip enrichment if unchanged.
- Safe HTTP: timeouts, retries with jitter, per‑domain concurrency caps.
- Thin routes, pure services, small modules (already in place).

## 3. Scope (MVP)

- Seed types supported:
  - `post`: URL or shortcode. Resolve media ID, fetch commenters, fetch minimal profile info for each commenter, upsert profiles.
  - `tag`: hashtag (without `#`). List recent/top media for the tag (capped), then do the same commenters → profiles flow for each media.
- Provider: Instagram only (JSON-first, HTML fallback).
- Outputs:
  - `"ProfileRaw"`: raw payload JSON + `contentHash` + `lastSeen`.
  - `"ProfileFeatures"`: `followers`, `hasLink`, `recentActivityAt`, `features` JSON, `versionHash`.
- Config knobs (per request, with safe defaults):
  - `max_profiles`, `max_media_per_tag`, `max_comments_per_media`.
  - `request_timeout_s`, `retries`, `backoff_s`.
  - `concurrency`, `per_domain_limit`.
  - Optional `headers` (cookies/UA) and `proxy` from orchestrator.

Out of scope (MVP)
- New tables for posts or comments.
- Login/session acquisition flows.
- Providers beyond Instagram (we create the seam now).

## 4. Current Fit With Repo

- Endpoint + background: `apps/crawler/app/api/crawl.py` (kept small).
- Orchestration: `apps/crawler/app/core/crawl_service.py` (bounded concurrency, skip‑when‑unchanged).
- Enrichment v1: `apps/crawler/app/core/enrich.py`.
- Write path: `apps/crawler/app/io/db.py` (idempotent upserts).
- HTTP + limits: `apps/crawler/app/io/http_client.py` (timeouts, retries, per‑domain caps) and `apps/crawler/app/io/html_parser.py`.
- Provider seam (Instagram):
  - Constants: `apps/crawler/app/io/endpoints.py`
  - Wrapper: `apps/crawler/app/io/providers/instagram.py`

## 5. Architecture (MVP flow)

- `POST /crawl/jobs` → background task → choose strategy by `seed_type`.
- `seed_type = 'post'` (URL or shortcode):
  1) Resolve `media_id` (`instagram.media_id_from_shortcode`) if a shortcode/URL was provided.
  2) Fetch paginated comments (`instagram.get_media_comments`) with a cap.
  3) For each commenter username:
     - Fetch profile info (`instagram.get_web_profile_info`) → build profile payload.
     - Compute `content_hash` → upsert `"ProfileRaw"` and `"ProfileFeatures"` (copy `versionHash`).
- `seed_type = 'tag'`:
  1) List recent/top media for the tag (JSON template if available, else basic HTML tag page parse).
  2) For each media (cap by `max_media_per_tag`), run the same comment → profile pipeline.

Concurrency & safety
- Global bounded concurrency (already) for DB upserts.
- Per‑domain caps (already) for HTTP to avoid bursts to the same host.
- Retries with jittered backoff; timeouts on all requests.

## 6. Data Mapping (commenter → profile)

- `username`: commenter handle.
- `followers`: from profile info if available; else `0`.
- `bio`, `captions`, `images`, `link_domains`: from profile info if available; otherwise minimal defaults.
- `recent_activity_ts`: comment timestamp, media timestamp, or `None`.
- Hashing: `content_hash(profile)` from stable canonical fields; `versionHash = content_hash` in features.

## 7. API Contract (Crawler)

- `POST /crawl/jobs`
  - Request shape:
    ```json
    {
      "seed_type": "post" | "tag" | "url",
      "seed_value": "<shortcode | full URL | hashtag>",
      "crawl_config": {
        "mode": "real" | "fake",
        "max_profiles": 100,
        "max_media_per_tag": 20,
        "max_comments_per_media": 500,
        "request_timeout_s": 10.0,
        "retries": 2,
        "backoff_s": 0.25,
        "concurrency": 5,
        "per_domain_limit": 2,
        "headers": { "Cookie": "...", "User-Agent": "..." },
        "proxy": null
      }
    }
    ```
  - Response: `{ "status": "queued" }` (work continues in background).
- `GET /health` → `{ ok: true | false, error?: string }` (runs `SELECT 1`).

## 8. Provider Interface (Instagram now, others later)

- Implemented in `apps/crawler/app/io/providers/instagram.py` using constants from `apps/crawler/app/io/endpoints.py`.
- Functions used by the crawler orchestration:
  - `media_id_from_shortcode(client, shortcode) -> str | None` (web → mobile → HTML fallback).
  - `get_media_comments(client, media_id, max_id=None, min_id=None)` (paginates; cap by config).
  - `get_web_profile_info(client, username)` (profile basics for enrichment and followers).
  - Optional: `search_users`, `list_media_by_tag` for tag discovery.

## 9. Config & Defaults

- Env (global defaults):
  - `CRAWLER_REQUEST_TIMEOUT_S=10.0`, `CRAWLER_RETRIES=2`, `CRAWLER_BACKOFF_S=0.25`, `CRAWLER_PER_DOMAIN_LIMIT=2`.
  - Optional: `CRAWLER_TAG_URL_TEMPLATE`, `CRAWLER_USER_URL_TEMPLATE`, `CRAWLER_PROXY`.
- Per request overrides via `crawl_config`.

## 10. Observability

- Logs (JSON-like):
  - `crawl.accepted`: seed, cfg snapshot.
  - `crawl.start`: units planned (e.g., media count).
  - `crawl.done`: `fetched_count`, `changed_count`, `skipped_count`, `error_count`, `duration_ms`.
  - Per HTTP error: provider, URL, reason (rate limit, timeout, etc.).
- Health: DB `SELECT 1`.

## 11. Performance & Safety

- Retries + jittered backoff; all requests time‑bounded.
- Per‑domain caps (e.g., 2) and global concurrency (e.g., 5).
- Skip enrichment when unchanged to save CPU/IO.

## 12. Failure Modes & Handling

- Bad shortcode / unknown URL: media ID lookup fails → log and continue.
- 429/403: retry with backoff, respect caps; if persistent, log and skip that unit.
- HTML-only pages: parse best‑effort; if parsing fails, log and continue.
- Missing cookies/headers: 401/403 → log and skip.

## 13. Security

- No secrets stored by crawler. Cookies/headers (if needed) are passed in `crawl_config.headers` from the orchestrator.

## 14. Success Metrics (MVP)

- Post seed: commenters’ profiles upserted; job does not crash; logs show start/done with counts.
- Tag seed: at least `N` media processed (configurable), commenters’ profiles upserted.
- p50 request latency < 1s on small batches; error rate < 5%.

## 15. Test Plan

- Unit tests:
  - Provider URL builders and shortcode → ID logic (mock HTTP).
  - Enrichment parsing (`_parse_dt`) and hash stability (existing tests cover parts).
  - HTML parser small page → expected fields (already added).
- Integration (local):
  - Fake mode: post/tag seeds write 5–10 profiles.
  - Real mode: a known JSON/HTML URL produces one row.
- Manual runbook: start DB + crawler; POST seeds; verify with SQL queries.

## 16. Rollout Plan

1) Post strategy (shortcode/URL → comments → profiles) with small caps.
2) Tag strategy (tag → media list → reuse post strategy per media).
3) Optional: refine tag listing (JSON template or HTML tag page fallback).
4) Add a simple Provider base/registry to enable new platforms with the same function names.

## 17. Risks & Mitigations

- Endpoint shape changes: centralized in `endpoints.py` and `providers/instagram.py` → easy to patch.
- Rate limits: per‑domain caps + backoff and small caps for MVP.
- Auth required: orchestrator provides cookies/UA; we pass‑through in `crawl_config.headers`.
- HTML parsing brittle: JSON-first, HTML is a fallback; test one small fixture.

## 18. Concrete Tasks (small PRs)

- Post comments orchestration: `core/post_comments_service.py` (calls instagram wrapper, upserts profiles).
- Tag discovery orchestration: `core/tag_crawl_service.py` (lists media, delegates to post service).
- Compact job logs with counts + duration.
- Provider registry scaffold (`io/providers/base.py`, registry map) — optional after MVP works.

---

### Example Requests

Seed: single post (shortcode or full URL)

```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{
    "seed_type": "post",
    "seed_value": "CxyZ123",   
    "crawl_config": { "mode": "real", "max_profiles": 200, "max_comments_per_media": 500 }
  }'
```

Seed: hashtag (enumerate media, then fetch commenters)

```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{
    "seed_type": "tag",
    "seed_value": "builders",
    "crawl_config": { "mode": "real", "max_media_per_tag": 20, "max_comments_per_media": 200 }
  }'
```

This document describes what we will build, where each piece of code will live, and how it flows end‑to‑end using our existing crawler skeleton.
