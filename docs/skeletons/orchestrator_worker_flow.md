# Orchestrator Worker Flow (Python) — headers → POST crawler → refresh+retry once

This example shows how a Python orchestrator worker can:

1. Fetch host‑ready headers from the Account Manager.
2. POST a crawl job to the crawler service with `mode: "real"` and those headers.
3. If the crawl fails with `auth_expired`, refresh the session in the Account Manager and retry once with backoff.

Notes
- This is a skeleton for discussion. It does not change any existing schemas or APIs in this repo.
- It uses the design‑time clients in `docs/skeletons/orchestrator_client.py`.
- The crawler’s `/crawl/jobs` endpoint returns `{ "status": "queued" }` in the current implementation. In a real system, the failure signal (`auth_expired`) would be surfaced via job status/logs. For illustration, the snippet below shows the inline retry pattern you’d use when that signal is available to the worker.

## Minimal Worker Coroutine (async, httpx)

```python
import asyncio
import os
import httpx
from docs.skeletons.orchestrator_client import get_headers, refresh

CRAWLER_BASE = os.getenv("CRAWLER_BASE_URL", "http://localhost:8000")

async def post_crawl(seed_type: str, seed_value: str, cfg: dict, platform: str, account: str) -> None:
    """
    1) Fetch headers
    2) POST /crawl/jobs
    3) On auth_expired, refresh + retry once (2–5s backoff)
    """
    headers = await get_headers(platform, account, host="www.instagram.com")

    payload = {
        "seed_type": seed_type,
        "seed_value": seed_value,
        "crawl_config": { **cfg, "mode": "real", "headers": headers },
    }

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.post(f"{CRAWLER_BASE}/crawl/jobs", json=payload)
            r.raise_for_status()
            # In the current crawler, this returns {"status":"queued"}.
            # Failure signals are typically observed via logs or job status, not this response.
            return
        except httpx.HTTPStatusError as e:
            body = e.response.text or ""
            if "auth_expired" in body:
                # Refresh + backoff + retry once
                await refresh(platform, account)
                await asyncio.sleep(3)
                headers = await get_headers(platform, account, host="www.instagram.com")
                payload["crawl_config"]["headers"] = headers
                r2 = await client.post(f"{CRAWLER_BASE}/crawl/jobs", json=payload)
                r2.raise_for_status()
                return
            raise  # propagate other errors
```

## Integrating With a Queue (RQ/Celery)

- Wrap `post_crawl(...)` in your queue worker task.
- Optional: enforce per‑account concurrency with a Redis semaphore (see `docs/skeletons/redis_semaphore.py`).
- Optional: add a short TTL header cache (Redis `SETEX`) keyed by `{platform}:{account}:{host}:v{am_header_version}` to reduce Account Manager calls during bursts.

## Detecting `auth_expired` in Practice

Because `/crawl/jobs` queues background work, the worker usually learns about failures via logs or job status rather than this HTTP response. Two common patterns:

- Job status endpoint: the crawler (or a controller watching it) records per‑job outcomes (success, `auth_expired`, `rate_limited`) in a store the orchestrator polls.
- Log/stream hook: the orchestrator consumes structured logs or events (e.g., via Redis pub/sub or a webhook) and performs the refresh+retry when it observes `auth_expired`.

The retry logic stays the same: one refresh+retry with 2–5s jittered backoff for `auth_expired`; exponential backoff (no refresh) for `rate_limited`.

## Safety & Redaction

- Never log headers or cookies. Redact `Cookie`, `Authorization`, and `X-IG-*` keys in your logger.
- Use TLS between services and a short‑lived Bearer/OAuth token to call the Account Manager.

```python
# example: install a simple redactor
from docs.skeletons.logging_redactor import install_redaction
install_redaction()
```

## Metrics (optional)

- Count and time header fetches/refreshes, and track `auth_expired`/`rate_limited` rates.

```python
from docs.skeletons.metrics import headers_get_latency, headers_refresh_latency, auth_expired_total
# example usage:
# headers_get_latency.labels("ig", account, "www.instagram.com").observe(0.042)
# auth_expired_total.labels("ig", account).inc()
```

This flow keeps secrets centralized in the Account Manager, fetches headers once per crawl, and only retries on rare `auth_expired` events.

