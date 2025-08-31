from typing import Any, Iterable
import asyncio
import time

from .hash import content_hash
from ..io.db import upsert_profile, get_existing_hash
from ..io.http_client import HttpClient, fake_fetch, real_fetch
from .enrich import enrich
from .post_comments_service import crawl_post_comments
from .tag_crawl_service import crawl_tag


async def run_crawl(seed_type: str, seed_value: str, cfg: Any, pool) -> None:
    max_profiles = getattr(cfg, "max_profiles", 100)

    if getattr(cfg, "mode", "fake") == "real":
        client = HttpClient(
            headers=getattr(cfg, "headers", None),
            proxy=getattr(cfg, "proxy", None),
            timeout_s=getattr(cfg, "request_timeout_s", 10.0),
            retries=getattr(cfg, "retries", 2),
            backoff_s=getattr(cfg, "backoff_s", 0.25),
            per_domain_limit=getattr(cfg, "per_domain_limit", 2),
        )
        if seed_type == "post":
            profiles = await crawl_post_comments(seed_value, cfg, client)
        elif seed_type == "tag":
            profiles = await crawl_tag(seed_value, cfg, client)
        else:
            # Fallback for generic URL/user cases using existing path
            profiles = await real_fetch(seed_type, seed_value, max_profiles, client)
    else:
        profiles = await fake_fetch(seed_type, seed_value, max_profiles)

    sem = asyncio.Semaphore(max(1, int(getattr(cfg, "concurrency", 5))))
    lock = asyncio.Lock()
    counters = {"fetched": len(profiles), "changed": 0, "skipped_unchanged": 0, "errors": 0}

    async def _process(p: dict) -> None:
        async with sem:
            try:
                h = content_hash(p)
                async with pool.acquire() as conn:
                    existing = await get_existing_hash(conn, p.get('username', ''))
                    if existing == h:
                        # unchanged: do a cheap lastSeen bump via upsert; skip enrichment work
                        await upsert_profile(
                            conn,
                            p,
                            h,
                            has_link=False,
                            recent_activity_at=None,
                            features={},
                        )
                        async with lock:
                            counters["skipped_unchanged"] += 1
                        return
                    e = enrich(p)
                    await upsert_profile(
                        conn,
                        p,
                        h,
                        has_link=e["has_link"],
                        recent_activity_at=e["recent_activity_at"],
                        features=e["features"],
                    )
                    async with lock:
                        counters["changed"] += 1
            except Exception:
                async with lock:
                    counters["errors"] += 1

    # Simple structured start/end logs
    import logging

    logger = logging.getLogger("crawler")
    t0 = time.perf_counter()
    logger.info({
        "event": "crawl.start",
        "seed_type": seed_type,
        "seed_value": seed_value,
        "mode": getattr(cfg, "mode", "fake"),
        "fetched": counters["fetched"],
    })
    await asyncio.gather(*[_process(p) for p in profiles])
    dur_ms = int((time.perf_counter() - t0) * 1000)
    logger.info({
        "event": "crawl.done",
        "seed_type": seed_type,
        "seed_value": seed_value,
        "mode": getattr(cfg, "mode", "fake"),
        "fetched": counters["fetched"],
        "changed": counters["changed"],
        "skipped_unchanged": counters["skipped_unchanged"],
        "errors": counters["errors"],
        "duration_ms": dur_ms,
    })
