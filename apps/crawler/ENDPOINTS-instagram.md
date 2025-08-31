# Instagram Endpoints Cheat Sheet (for Crawler)

Purpose: quick reference to the key Instagram endpoints and patterns we rely on for tags, posts, reels, comments, and discovery. No code – just a guide for future engineers.

Notes up front
- Most web endpoints require valid session cookies and browser-like headers. Bring your own cookies via `crawl_config.headers`.
- GraphQL `query_hash` and `doc_id` values can change. Treat them as env-configurable, not hard‑coded business logic.
- Our crawler already has timeouts, retries with jitter, and per‑domain concurrency caps. Use them.

## Hashtag → Media (posts and reels)

Primary (GraphQL)
- URL: `https://www.instagram.com/graphql/query/`
- Method: GET
- Params:
  - `query_hash=9b498c08113f1e09617a1703c22b2f32`
  - `variables={"tag_name":"<tag>","first":50,"after":"<cursor|optional>"}`
- Referer: `https://www.instagram.com/explore/tags/<tag>/`
- Response path: `data.hashtag.edge_hashtag_to_media`
- Reels: nodes include `product_type`; reels show up as `product_type: "clips"`. Filter on that to isolate reels.
- Source: Instaloader `structures.py` (NodeIterator uses this exact query_hash).
- Caution: Make this `query_hash` env‑driven in implementation (e.g., `CRAWLER_IG_GQL_HASHTAG_HASH`).

Secondary (web info)
- URL: `https://www.instagram.com/api/v1/tags/web_info/`
- Method: GET, params: `tag_name=<tag>`
- Purpose: hashtag metadata; sometimes provides a `graphql.hashtag` snapshot. Good for sanity checks.
- Source: Instaloader `structures.py` uses this.

HTML Fallback (no JSON)
- URL: `https://www.instagram.com/explore/tags/<tag>/`
- Parse links for shortcodes:
  - Posts: `/p/{shortcode}/`
  - Reels: `/reel/{shortcode}/`
- Use these shortcodes with the shortcode→media ID flow below.

## Shortcode → media_id

Web API
- URL: `https://www.instagram.com/api/v1/media/shortcode/{shortcode}/`

Mobile API
- URL: `https://i.instagram.com/api/v1/media/shortcode/{shortcode}/`

Optional GraphQL Fallback (env‑only)
- If available, try GraphQL between mobile and HTML fallback.
- Env: `CRAWLER_IG_GQL_SHORTCODE_HASH`
- URL: `https://www.instagram.com/graphql/query/?query_hash=$HASH&variables={"shortcode":"CODE"}`
- Response path commonly includes `data.shortcode_media.id`

HTML Fallback
- Fetch the post page `https://www.instagram.com/p/{code}/` or reel page `https://www.instagram.com/reel/{code}/` and regex for an ID, e.g. `"media_id":"(\d+)"`, `"id":"(\d+)"`, or `"pk":"(\d+)"`.

## Comments for a media

- URL: `https://www.instagram.com/api/v1/media/{media_id}/comments/`
- Method: GET
- Pagination params: use `min_id` or `max_id` as provided in responses.
- Works for posts and reels once you have `media_id`.

## Profile reels (reference, profile‑oriented)

GraphQL (doc_id)
- URL: `https://www.instagram.com/graphql/query/`
- Method: POST
- `doc_id=7845543455542541` (friendly name: `PolarisProfileReelsTabContentQuery_connection`)
- Variables: `{ "data": { "page_size": 12, "include_feed_video": true, "target_user_id": "<userid>" } }`
- Source: Instaloader `structures.py` (profile reels tab).

Mobile Feed Reels Media
- URL: `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=<user_id>`
- Purpose: alternate profile reels listing.

## Top Search (discovery helper)

- URL: `https://www.instagram.com/web/search/topsearch/`
- Method: GET, params: `context=blended&query=<string>&include_reel=false&__a=1`
- Usage: discover hashtags/users/locations by string if you need to confirm a tag name exists.

## Headers & Auth (web endpoints)

Typical headers (examples; expect to tune per host):
- `User-Agent: Mozilla/5.0 (…Chrome… Safari…)`
- `Cookie: csrftoken=…; sessionid=…; ds_user_id=…; mid=…`
- `X-CSRFToken: <csrftoken>`
- `X-Requested-With: XMLHttpRequest`
- `Referer: https://www.instagram.com/`
- `Origin: https://www.instagram.com`
- `Accept: application/json`

For mobile endpoints (`i.instagram.com`), a mobile UA or specific app headers may work better. Instaloader chooses headers based on host.

## Rate Limits & Safety

- Expect occasional 429/403/timeouts; rely on:
  - Timeouts per request
  - Retries with exponential backoff + jitter
  - Per‑domain concurrency caps (e.g., 2–3)
- Always set small caps on pagination:
  - `first` in hashtag GraphQL
  - `max_comments_per_media`
  - `max_media_per_tag`

## Mapping to Our Wrapper

Current functions in `app/io/providers/instagram.py`:
- `list_media_by_tag(client, tag, limit)`
  - Today: JSON template via env or HTML fallback. You can upgrade to GraphQL using the query_hash above.
- `extract_shortcode_from_url(url_or_code)`
- `media_id_from_shortcode(client, shortcode)`
  - Web → Mobile → (optional GraphQL if env set) → HTML regex
- `get_media_comments(client, media_id, max_id/min_id)`
- `get_web_profile_info(client, username)`

Service flows using these:
- Post: shortcode/URL → media_id → comments → commenters → profiles → upserts
- Tag: tag → list media (prefer GraphQL; filter `product_type == "clips"` for reels) → per‑post comments → profiles → upserts

## Example GraphQL variables

Hashtag media variables (GET param `variables=`):
```json
{"tag_name":"solar","first":24,"after":null}
```

Shortcode lookup variables (if using env‑only fallback):
```json
{"shortcode":"CxyZ123"}
```

## Caveats

- GraphQL `query_hash` and `doc_id` values are not guaranteed stable; prefer env‑only configuration and clear logs when the fallback is used.
- HTML fallbacks can break if markup changes; keep parsers minimal and defensive.
- Respect Instagram’s terms and rate limits. Keep concurrency caps conservative.

## Sources (Instaloader excerpts)

- Hashtag GraphQL query_hash: used by `Hashtag.get_posts_resumable()`
- Hashtag web_info: `api/v1/tags/web_info/`
- Shortcode web/mobile APIs: `/api/v1/media/shortcode/{code}` (www & i.)
- Comments: `/api/v1/media/{media_id}/comments/`
- Profile reels doc_id: `7845543455542541`

This sheet is for quick endpoint recall and implementation hints. Keep endpoints env‑driven where practical, and lean on our HttpClient’s safety features.
