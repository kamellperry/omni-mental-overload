from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from ..models.crawl import CrawlConfig
from ..io.http_client import HttpClient
from ..io.providers import instagram as ig
from .post_comments_service import crawl_post_comments


async def crawl_tag(tag: str, cfg: CrawlConfig, client: HttpClient) -> List[Dict[str, Any]]:
    """Enumerate media for a hashtag, then reuse post comments pipeline.

    Returns a list of profile payloads (deduped by username). No DB writes here.
    """
    max_media = max(1, int(getattr(cfg, "max_media_per_tag", 20)))
    profiles: List[Dict[str, Any]] = []
    usernames: Set[str] = set()

    try:
        media_items = await ig.list_media_by_tag(client, tag, limit=max_media)
    except Exception:
        media_items = []

    for item in media_items[:max_media]:
        shortcode = None
        if isinstance(item, dict):
            shortcode = item.get("shortcode") or item.get("code") or None
        if not shortcode:
            continue
        sub = await crawl_post_comments(shortcode, cfg, client)
        for p in sub:
            uname = str(p.get("username", ""))
            if not uname or uname in usernames:
                continue
            usernames.add(uname)
            profiles.append(p)

    return profiles

