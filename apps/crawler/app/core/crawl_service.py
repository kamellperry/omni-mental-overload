from typing import Any, Iterable
import asyncio

from .hash import content_hash
from ..io.db import upsert_profile, get_existing_hash
from ..io.http_client import HttpClient, fake_fetch, real_fetch
from .enrich import enrich


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
        profiles = await real_fetch(seed_type, seed_value, max_profiles, client)
    else:
        profiles = await fake_fetch(seed_type, seed_value, max_profiles)

    sem = asyncio.Semaphore(max(1, int(getattr(cfg, "concurrency", 5))))

    async def _process(p: dict) -> None:
        async with sem:
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

    # Simple structured start/end logs
    import logging

    logger = logging.getLogger("crawler")
    logger.info({
        "event": "crawl.start",
        "seed_type": seed_type,
        "seed_value": seed_value,
        "mode": getattr(cfg, "mode", "fake"),
        "count": len(profiles),
    })
    await asyncio.gather(*[_process(p) for p in profiles])
    logger.info({
        "event": "crawl.done",
        "seed_type": seed_type,
        "seed_value": seed_value,
        "mode": getattr(cfg, "mode", "fake"),
        "count": len(profiles),
    })
