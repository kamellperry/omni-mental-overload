from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from ..models.crawl import CrawlConfig
from ..io.http_client import HttpClient
from ..io.providers import instagram as ig


_SHORTCODE_RE = re.compile(r"/p/([A-Za-z0-9_-]+)/?")


def _extract_shortcode(seed_value: str) -> str:
    m = _SHORTCODE_RE.search(seed_value)
    return m.group(1) if m else seed_value


def _pluck_username(obj: Dict[str, Any]) -> Optional[str]:
    user = obj.get("user") or obj.get("owner") or {}
    if isinstance(user, dict):
        return user.get("username") or user.get("pk") or user.get("id")
    return obj.get("username")


def _pluck_comment_ts(obj: Dict[str, Any]) -> Optional[str]:
    # Common fields in IG responses
    for key in ("created_at_utc", "created_at", "created_time", "taken_at"):
        v = obj.get(key)
        if v is not None:
            # Already ISO? Return as string; callers will parse if needed
            return str(v)
    return None


def _pluck_followers(profile_data: Any) -> int:
    # Try common shapes
    if isinstance(profile_data, dict):
        # web_profile_info style: {data: {user: {edge_followed_by: {count}}}}
        data = profile_data.get("data") or {}
        user = data.get("user") or profile_data.get("user") or {}
        if isinstance(user, dict):
            edge = user.get("edge_followed_by") or {}
            if isinstance(edge, dict) and isinstance(edge.get("count"), int):
                return int(edge["count"])  # type: ignore[index]
            if isinstance(user.get("follower_count"), (int, float)):
                return int(user["follower_count"])  # type: ignore[index]
        # flat shapes
        if isinstance(profile_data.get("followers"), (int, float)):
            return int(profile_data["followers"])  # type: ignore[index]
    return 0


def _map_profile(username: str, followers: int, comment_ts: Optional[str], profile_info: Any) -> Dict[str, Any]:
    # Minimal shape; callers enrich later
    bio = ""
    captions: List[str] = []
    images: List[Dict[str, Any]] = []
    link_domains: List[str] = []

    # Try to extract a couple of friendly fields from web_profile_info if present
    if isinstance(profile_info, dict):
        data = profile_info.get("data") or {}
        user = data.get("user") or profile_info.get("user") or {}
        if isinstance(user, dict):
            bio = str(user.get("biography") or user.get("bio") or "")
            # images and link_domains are optional; keep empty if unavailable

    return {
        "username": str(username),
        "followers": int(followers or 0),
        "bio": bio,
        "captions": captions,
        "images": images,
        "link_domains": link_domains,
        "recent_activity_ts": comment_ts,
    }


async def crawl_post_comments(seed_value: str, cfg: CrawlConfig, client: HttpClient) -> List[Dict[str, Any]]:
    """Resolve a post -> commenters -> profile payloads (no DB writes).

    - seed_value can be a shortcode or a full URL.
    - Stops after cfg.max_comments_per_media commenters (deduped by username).
    """
    shortcode = _extract_shortcode(seed_value)
    media_id = await ig.media_id_from_shortcode(client, shortcode)
    if not media_id:
        return []

    max_comments = max(1, int(getattr(cfg, "max_comments_per_media", 200)))
    out: List[Dict[str, Any]] = []
    seen_users: set[str] = set()

    next_max_id: Optional[str] = None
    while True:
        data = await ig.get_media_comments(client, media_id, max_id=next_max_id)
        comments = []
        if isinstance(data, dict):
            if isinstance(data.get("comments"), list):
                comments = [c for c in data["comments"] if isinstance(c, dict)]  # type: ignore[index]
            elif isinstance(data.get("items"), list):
                comments = [c for c in data["items"] if isinstance(c, dict)]  # type: ignore[index]
        if not comments:
            break

        for c in comments:
            uname = _pluck_username(c)
            if not uname or str(uname) in seen_users:
                continue
            seen_users.add(str(uname))
            ts = _pluck_comment_ts(c)
            # Fetch minimal profile info (can be None on error)
            info = None
            try:
                info = await ig.get_web_profile_info(client, str(uname))
            except Exception:
                info = None
            followers = _pluck_followers(info)
            out.append(_map_profile(str(uname), followers, ts, info))
            if len(out) >= max_comments:
                break
        if len(out) >= max_comments:
            break

        # pagination cursors
        next_max_id = None
        if isinstance(data, dict):
            # Prefer explicit min_id/max_id model; fallback to next_max_id
            if isinstance(data.get("next_max_id"), str):
                next_max_id = data["next_max_id"]  # type: ignore[index]
        if not next_max_id:
            break

    return out

