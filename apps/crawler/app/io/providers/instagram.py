from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional, List
from urllib.parse import urlencode, urlparse

from ..http_client import HttpClient
from ..endpoints import (
    INSTAGRAM_WEB_PROFILE_INFO,
    INSTAGRAM_MEDIA_COMMENTS,
    INSTAGRAM_SEARCH_TOP,
    INSTAGRAM_USER_INFO_BY_ID,
    INSTAGRAM_MEDIA_SHORTCODE_WEB,
    INSTAGRAM_MEDIA_SHORTCODE_MOBILE,
    INSTAGRAM_POST_HTML,
)


def _with_params(url: str, params: Dict[str, str]) -> str:
    qs = urlencode(params)
    if not qs:
        return url
    sep = '&' if ('?' in url) else '?'
    return f"{url}{sep}{qs}"


async def get_web_profile_info(client: HttpClient, username: str) -> Any:
    url = _with_params(INSTAGRAM_WEB_PROFILE_INFO, {"username": username})
    return await client.get_json(url)


async def get_media_comments(
    client: HttpClient,
    media_id: str,
    *,
    max_id: Optional[str] = None,
    min_id: Optional[str] = None,
) -> Any:
    url = INSTAGRAM_MEDIA_COMMENTS.format(media_id=media_id)
    params: Dict[str, str] = {}
    if min_id:
        params["min_id"] = min_id
    elif max_id:
        params["max_id"] = max_id
    if params:
        url = _with_params(url, params)
    return await client.get_json(url)


async def search_users(client: HttpClient, query: str) -> Any:
    params = {
        "context": "blended",
        "query": query,
        "rank_token": "",
        "include_reel": "true",
    }
    url = _with_params(INSTAGRAM_SEARCH_TOP, params)
    return await client.get_json(url)


async def get_user_info_by_id(client: HttpClient, user_id: str) -> Any:
    url = INSTAGRAM_USER_INFO_BY_ID.format(user_id=user_id)
    return await client.get_json(url)


async def media_id_from_shortcode(client: HttpClient, shortcode: str) -> Optional[str]:
    # Try web endpoint
    try:
        data = await client.get_json(
            INSTAGRAM_MEDIA_SHORTCODE_WEB.format(shortcode=shortcode)
        )
        if isinstance(data, dict):
            media = data.get("media") or {}
            return str(media.get("id") or data.get("id")) if (media or data.get("id")) else None
    except Exception:
        pass

    # Try mobile endpoint
    try:
        data = await client.get_json(
            INSTAGRAM_MEDIA_SHORTCODE_MOBILE.format(shortcode=shortcode)
        )
        if isinstance(data, dict):
            if "items" in data and data["items"]:
                return str(data["items"][0].get("id"))
            return str(data.get("media_id") or data.get("id")) if (data.get("media_id") or data.get("id")) else None
    except Exception:
        pass

    # Fallback to HTML page scrape for id
    try:
        ctype, text = await client.get_raw(INSTAGRAM_POST_HTML.format(shortcode=shortcode))
        if text and "html" in (ctype or "").lower():
            for pattern in (r'"media_id":"(\d+)"', r'"id":"(\d+)"', r'"pk":"(\d+)"'):
                m = re.search(pattern, text)
                if m:
                    return m.group(1)
    except Exception:
        return None
    return None


async def list_media_by_tag(client: HttpClient, tag: str, limit: int = 20) -> List[Dict[str, str]]:
    """Return a list of media dictionaries with at least `shortcode`.

    Prefers JSON from CRAWLER_TAG_URL_TEMPLATE if set. Falls back to
    scraping https://www.instagram.com/explore/tags/{tag}/ for /p/{shortcode}/ links.
    """
    tpl = os.getenv("CRAWLER_TAG_URL_TEMPLATE")
    if tpl:
        try:
            url = tpl.format(value=tag, tag=tag)
            data = await client.get_json(url)
            items: List[Dict[str, Any]] = []
            if isinstance(data, dict):
                if isinstance(data.get("items"), list):
                    items = [x for x in data["items"] if isinstance(x, dict)]  # type: ignore[index]
                elif isinstance(data.get("media"), list):
                    items = [x for x in data["media"] if isinstance(x, dict)]  # type: ignore[index]
            elif isinstance(data, list):
                items = [x for x in data if isinstance(x, dict)]
            out: List[Dict[str, str]] = []
            for it in items:
                sc = it.get("shortcode") or it.get("code")
                if isinstance(sc, str):
                    out.append({"shortcode": sc})
                    if len(out) >= limit:
                        break
            if out:
                return out
        except Exception:
            pass

    # HTML fallback
    try:
        url = f"https://www.instagram.com/explore/tags/{tag}/"
        ctype, text = await client.get_raw(url)
        if text and "html" in (ctype or "").lower():
            out: List[Dict[str, str]] = []
            seen = set()
            for m in re.finditer(r"/p/([A-Za-z0-9_-]+)/", text):
                sc = m.group(1)
                if sc not in seen:
                    seen.add(sc)
                    out.append({"shortcode": sc})
                    if len(out) >= limit:
                        break
            return out
    except Exception:
        return []
    return []

__all__ = [
    "get_web_profile_info",
    "get_media_comments",
    "search_users",
    "get_user_info_by_id",
    "media_id_from_shortcode",
    "list_media_by_tag",
]

def extract_shortcode_from_url(url_or_code: str) -> str:
    """Return shortcode if given a full Instagram URL; otherwise return input.

    Supports /p/{code}/ and /reel/{code}/ URL forms.
    """
    if url_or_code.startswith("http://") or url_or_code.startswith("https://"):
        try:
            path = urlparse(url_or_code).path or ""
            m = re.search(r"/(?:p|reel)/([A-Za-z0-9_-]+)/?", path)
            if m:
                return m.group(1)
        except Exception:
            return url_or_code
    return url_or_code
