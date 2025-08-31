# Crawler — Post/Tag Comment Crawl

This is the FastAPI crawler service. It accepts seeds (post, tag, url), fetches data using resilient HTTP, builds profile payloads, and writes to Postgres via idempotent upserts.

Key modules
- `api/crawl.py`: HTTP endpoints (`POST /crawl/jobs`, `GET /health`)
- `core/crawl_service.py`: dispatch + hashing/enrichment/upserts
- `core/post_comments_service.py`: post → comments → commenter profiles (returns list of profiles)
- `core/tag_crawl_service.py`: tag → media list → reuse post flow (returns list of profiles)
- `io/providers/instagram.py`: Instagram wrapper + endpoints (JSON-first, HTML fallback)
- `io/http_client.py`: curl_cffi client with timeouts/retries + per-domain caps
- `io/db.py`: asyncpg pool + upserts (ProfileRaw, ProfileFeatures)

Run (dev)
```bash
# In one terminal, ensure Postgres is up and tables exist (run prisma migrate from apps/api)
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health
```bash
curl http://localhost:8000/health
```

Trigger a crawl (fake mode)
```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{ "seed_type":"tag", "seed_value":"builders", "crawl_config": { "max_profiles": 10 } }'
```

Trigger a real post crawl (URL or shortcode)
```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{
    "seed_type": "post",
    "seed_value": "https://www.instagram.com/p/ABC123/",
    "crawl_config": {
      "mode": "real",
      "max_comments_per_media": 100,
      "request_timeout_s": 10,
      "retries": 2,
      "backoff_s": 0.25
    }
  }'
```

Trigger a real tag crawl (discover media, then commenters)
```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{
    "seed_type": "tag",
    "seed_value": "builders",
    "crawl_config": {
      "mode": "real",
      "max_media_per_tag": 10,
      "max_comments_per_media": 100
    }
  }'
```

Auth headers (if needed)
Some Instagram endpoints require authenticated cookies and a browser UA. Pass them via `crawl_config.headers`.
```bash
curl -X POST http://localhost:8000/crawl/jobs \
  -H 'content-type: application/json' \
  -d '{
    "seed_type": "post",
    "seed_value": "CxyZ123",
    "crawl_config": {
      "mode": "real",
      "headers": {
        "User-Agent": "Mozilla/5.0 ...",
        "Cookie": "sessionid=...; csrftoken=..."
      }
    }
  }'
```

Where data is stored
- Table `"ProfileRaw"`: `username` (PK), `payload` (raw JSON), `contentHash`, `lastSeen`
- Table `"ProfileFeatures"`: `username` (PK), `followers`, `hasLink`, `recentActivityAt`, `features` (JSON), `versionHash`, `updatedAt`

Quick DB checks
```bash
psql 'postgresql://postgres:postgres@localhost:5432/omni' -c 'SELECT COUNT(*) FROM "ProfileRaw";'
psql 'postgresql://postgres:postgres@localhost:5432/omni' -c 'SELECT username, "lastSeen" FROM "ProfileRaw" ORDER BY "lastSeen" DESC LIMIT 5;'
psql 'postgresql://postgres:postgres@localhost:5432/omni' -c 'SELECT username, followers, "hasLink", "recentActivityAt" FROM "ProfileFeatures" ORDER BY "updatedAt" DESC LIMIT 5;'
```

Config knobs (per request in `crawl_config`)
- `mode`: `fake` | `real`
- `max_profiles`, `max_comments_per_media`, `max_media_per_tag`
- `request_timeout_s`, `retries`, `backoff_s`
- `concurrency` (DB upserts), `per_domain_limit` (HTTP to same host)
- `headers` (cookies, UA), `proxy`

Env overrides (optional)
- `CRAWLER_TAG_URL_TEMPLATE` — JSON endpoint for tag media (e.g. `https://api.example.com/tag/{value}`)
- `CRAWLER_USER_URL_TEMPLATE` — JSON endpoint for user fetch
- `CRAWLER_REQUEST_TIMEOUT_S`, `CRAWLER_RETRIES`, `CRAWLER_BACKOFF_S`, `CRAWLER_PER_DOMAIN_LIMIT`, `CRAWLER_PROXY`
- `IG_GRAPHQL_ENABLE` — `true` (default) to allow GraphQL paths; set to `false` to disable
- `IG_HASH_USER_BY_USERNAME` — optional GraphQL hash for user-by-username (if provided, provider tries GraphQL before legacy endpoint)
- `CRAWLER_IG_GQL_SHORTCODE_HASH` — optional GraphQL hash used as a fallback to resolve a post `shortcode` → `media_id` (order: web → mobile → GraphQL → HTML)

Logs
- `crawl.accepted` when a job is queued
- `crawl.start` and `crawl.done` with counts and mode
- Errors include provider URL and reason (timeout, rate limit, etc.)

Notes
- Services only build profile dicts; `core/crawl_service.py` handles content hashing, enrichment, and upserts.
- No schema changes: we only write to `ProfileRaw` and `ProfileFeatures`.

GraphQL shortcode fallback
- If `CRAWLER_IG_GQL_SHORTCODE_HASH` is set and GraphQL is enabled, the provider will try:
  1) web `media/shortcode` endpoint
  2) mobile `media/shortcode` endpoint
  3) GraphQL `https://www.instagram.com/graphql/query/?query_hash=$HASH&variables={"shortcode":"CODE"}`
  4) HTML page regex
- This path requires valid cookies/UA in `crawl_config.headers` for Instagram.
