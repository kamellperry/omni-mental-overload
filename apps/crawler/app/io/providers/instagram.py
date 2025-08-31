from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional, List, Iterable, Set
from urllib.parse import urlencode, urlparse, quote
import logging

from ..http_client import HttpClient
from ..endpoints import (
    INSTAGRAM_WEB_PROFILE_INFO,
    INSTAGRAM_MEDIA_COMMENTS,
    INSTAGRAM_SEARCH_TOP,
    INSTAGRAM_USER_INFO_BY_ID,
    INSTAGRAM_MEDIA_SHORTCODE_WEB,
    INSTAGRAM_MEDIA_SHORTCODE_MOBILE,
    INSTAGRAM_POST_HTML,
    INSTAGRAM_GRAPHQL_QUERY,
)

logger = logging.getLogger("crawler.ig")

def _classify_error(err: BaseException) -> str:
    msg = str(err).lower()
    if "http 429" in msg:
        return "rate_limited"
    if "http 403" in msg or "http 401" in msg:
        return "auth_required"
    if "http 404" in msg:
        return "not_found"
    if "timeout" in msg:
        return "timeout"
    if "ssl" in msg or "connection" in msg or "conn" in msg:
        return "connection"
    if "http 5" in msg:
        return "server_error"
    return "unknown"

def _with_params(url: str, params: Dict[str, str]) -> str:
    qs = urlencode(params)
    if not qs:
        return url
    sep = '&' if ('?' in url) else '?'
    return f"{url}{sep}{qs}"


async def get_web_profile_info(client: HttpClient, username: str) -> Any:
    # Try GraphQL first if enabled and a hash is provided
    if _graphql_enabled():
        qh = _get_hash("IG_HASH_USER_BY_USERNAME")
        if qh:
            try:
                data = await get_graphql(client, qh, {"username": username})
                if isinstance(data, dict) and isinstance((data.get("data") or {}).get("user"), dict):
                    return data
            except Exception:
                pass
    # Fallback to legacy web profile info endpoint
    url = _with_params(INSTAGRAM_WEB_PROFILE_INFO, {"username": username})
    try:
        data = await client.get_json(url)
        return data
    except Exception as e:
        from urllib.parse import urlparse as _p
        u = _p(url)
        endpoint = f"{u.netloc}{u.path}"
        logger.info({"event": "ig.http.error", "endpoint": endpoint, "reason": _classify_error(e)})
        raise


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
    try:
        data = await client.get_json(url)
        return data
    except Exception as e:
        from urllib.parse import urlparse as _p
        u = _p(url)
        endpoint = f"{u.netloc}{u.path}"
        logger.info({"event": "ig.http.error", "endpoint": endpoint, "reason": _classify_error(e)})
        raise


async def search_users(client: HttpClient, query: str) -> Any:
    params = {
        "context": "blended",
        "query": query,
        "rank_token": "",
        "include_reel": "true",
    }
    url = _with_params(INSTAGRAM_SEARCH_TOP, params)
    try:
        data = await client.get_json(url)
        return data
    except Exception as e:
        from urllib.parse import urlparse as _p
        u = _p(url)
        endpoint = f"{u.netloc}{u.path}"
        logger.info({"event": "ig.http.error", "endpoint": endpoint, "reason": _classify_error(e)})
        raise


async def get_user_info_by_id(client: HttpClient, user_id: str) -> Any:
    url = INSTAGRAM_USER_INFO_BY_ID.format(user_id=user_id)
    try:
        return await client.get_json(url)
    except Exception as e:
        logger.info({"event": "ig.http.error", "url": url, "reason": _classify_error(e)})
        raise


async def media_id_from_shortcode(client: HttpClient, shortcode: str) -> Optional[str]:
    # Try web endpoint
    try:
        web_url = INSTAGRAM_MEDIA_SHORTCODE_WEB.format(shortcode=shortcode)
        data = await client.get_json(web_url)
        if isinstance(data, dict):
            media = data.get("media") or {}
            return str(media.get("id") or data.get("id")) if (media or data.get("id")) else None
    except Exception:
        pass

    # Try mobile endpoint
    try:
        mob_url = INSTAGRAM_MEDIA_SHORTCODE_MOBILE.format(shortcode=shortcode)
        data = await client.get_json(mob_url)
        if isinstance(data, dict):
            if "items" in data and data["items"]:
                return str(data["items"][0].get("id"))
            return str(data.get("media_id") or data.get("id")) if (data.get("media_id") or data.get("id")) else None
    except Exception:
        pass

    # Optional GraphQL fallback (env only)
    gql_hash = os.getenv("CRAWLER_IG_GQL_SHORTCODE_HASH")
    if _graphql_enabled() and gql_hash:
        try:
            data = await get_graphql(client, gql_hash, {"shortcode": shortcode})
            if isinstance(data, dict):
                node = (data.get("data") or {}).get("shortcode_media") if data.get("data") else None
                if isinstance(node, dict) and node.get("id"):
                    logger.info({
                        "event": "ig.shortcode.graphql",
                        "used": True,
                        "shortcode": shortcode,
                    })
                    return str(node.get("id"))
        except Exception:
            # fall through to HTML
            logger.info({
                "event": "ig.shortcode.graphql",
                "used": False,
                "shortcode": shortcode,
                "reason": "error",
            })
    else:
        logger.info({
            "event": "ig.shortcode.graphql",
            "used": False,
            "shortcode": shortcode,
            "reason": "disabled_or_missing_hash",
        })

    # Fallback to HTML page scrape for id
    try:
        url_html = INSTAGRAM_POST_HTML.format(shortcode=shortcode)
        ctype, text = await client.get_raw(url_html)
        if text and "html" in (ctype or "").lower():
            for pattern in (r'"media_id":"(\d+)"', r'"id":"(\d+)"', r'"pk":"(\d+)"'):
                m = re.search(pattern, text)
                if m:
                    return m.group(1)
    except Exception:
        return None
    return None


def _normalize_media_types(media_types: Optional[Iterable[str]]) -> Set[str]:
    if not media_types:
        return {"post", "reel"}
    out: Set[str] = set()
    for x in media_types:
        s = str(x).strip().lower()
        if s in ("reel", "reels", "clip", "clips"):
            out.add("reel")
        elif s in ("post", "posts"):
            out.add("post")
    return out or {"post", "reel"}


def _classify_type_from_node(node: Dict[str, Any]) -> str:
    # For GraphQL nodes, reels are product_type == 'clips'
    pt = node.get("product_type")
    if isinstance(pt, str) and pt.lower() == "clips":
        return "reel"
    return "post"


async def list_media_by_tag(
    client: HttpClient,
    tag: str,
    limit: int = 20,
    media_types: Optional[Iterable[str]] = None,
) -> List[Dict[str, str]]:
    """Return a list of media dicts with at least `shortcode`.

    Preference order:
      1) Instagram GraphQL hashtag query (Instaloader-style query hash)
      2) JSON template via CRAWLER_TAG_URL_TEMPLATE
      3) HTML tag page scrape for /p/{shortcode}/ links
    """
    # 1) Try GraphQL hashtag listing (env-only hash; may require cookies/UA)
    allowed = _normalize_media_types(media_types)
    gql_hash = os.getenv("CRAWLER_IG_GQL_HASHTAG_HASH")
    if _graphql_enabled() and gql_hash:
        try:
            out: List[Dict[str, str]] = []
            after: Optional[str] = None
            page = 0
            while len(out) < limit and page < 10:  # safety bound
                variables = {"tag_name": tag, "first": 12}
                if after:
                    variables["after"] = after
                vars_json = json.dumps(variables, separators=(",", ":"), ensure_ascii=False)
                url = f"{INSTAGRAM_GRAPHQL_QUERY}?query_hash={quote(gql_hash)}&variables={quote(vars_json)}"
                data = await client.get_json(url)
                edges = []
                if isinstance(data, dict):
                    hashtag = (data.get("data") or {}).get("hashtag") if data.get("data") else None
                    if isinstance(hashtag, dict):
                        edge = hashtag.get("edge_hashtag_to_media") or {}
                        edges = edge.get("edges") or []
                        page_info = edge.get("page_info") or {}
                        after = page_info.get("end_cursor") if page_info.get("has_next_page") else None
                for e in edges:
                    if not isinstance(e, dict):
                        continue
                    node = e.get("node") or {}
                    # Classify into post/reel and filter by allowed
                    t = _classify_type_from_node(node)  # "post" or "reel"
                    if t not in allowed:
                        continue
                    sc = node.get("shortcode")
                    if isinstance(sc, str):
                        out.append({"shortcode": sc})
                        if len(out) >= limit:
                            break
                if not edges or not after:
                    break
                page += 1
            if out:
                return out
        except Exception:
            pass
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
                    # Map provider type fields to post/reel; default to post if unknown
                    # Known keys: product_type (clips -> reel), media_type (2->reel), is_reel flag
                    t = "post"
                    pt = it.get("product_type")
                    if isinstance(pt, str) and pt.lower() == "clips":
                        t = "reel"
                    elif isinstance(it.get("is_reel"), bool) and it.get("is_reel"):
                        t = "reel"
                    elif isinstance(it.get("media_type"), (int, float)) and int(it.get("media_type")) == 2:
                        t = "reel"
                    if t not in allowed:
                        continue
                    out.append({"shortcode": sc})
                    if len(out) >= limit:
                        break
            if out:
                return out
        except Exception:
            pass

    # HTML fallback (support both /p/ and /reel/ shortcodes)
    try:
        url = f"https://www.instagram.com/explore/tags/{tag}/"
        try:
            ctype, text = await client.get_raw(url)
        except Exception as e:
            from urllib.parse import urlparse as _p
            u = _p(url)
            endpoint = f"{u.netloc}{u.path}"
            logger.info({"event": "ig.http.error", "endpoint": endpoint, "reason": _classify_error(e)})
            return []
        if text and "html" in (ctype or "").lower():
            out: List[Dict[str, str]] = []
            seen = set()
            # Filter by allowed types using path: /p/ => post, /reel/ => reel
            if "post" in allowed:
                for m in re.finditer(r"/p/([A-Za-z0-9_-]+)/", text):
                    sc = m.group(1)
                    if sc not in seen:
                        seen.add(sc)
                        out.append({"shortcode": sc})
                        if len(out) >= limit:
                            break
            if len(out) < limit and "reel" in allowed:
                for m in re.finditer(r"/reel/([A-Za-z0-9_-]+)/", text):
                    sc = m.group(1)
                    if sc not in seen:
                        seen.add(sc)
                        out.append({"shortcode": sc})
                        if len(out) >= limit:
                            break
            return out
    except Exception as e:
        from urllib.parse import urlparse as _p
        u = _p(f"https://www.instagram.com/explore/tags/{tag}/")
        endpoint = f"{u.netloc}{u.path}"
        logger.info({"event": "ig.http.error", "endpoint": endpoint, "reason": _classify_error(e)})
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


def _graphql_enabled() -> bool:
    flag = os.getenv("IG_GRAPHQL_ENABLE", "true").strip().lower()
    return flag not in ("0", "false", "no")


def _get_hash(env_key: str, default: Optional[str] = None) -> Optional[str]:
    val = os.getenv(env_key)
    return val if val else default


async def get_graphql(client: HttpClient, query_hash: str, variables: Dict[str, Any]) -> Any:
    vars_json = json.dumps(variables, separators=(",", ":"), ensure_ascii=False)
    url = f"{INSTAGRAM_GRAPHQL_QUERY}?query_hash={quote(query_hash)}&variables={quote(vars_json)}"
    try:
        return await client.get_json(url)
    except Exception as e:
        logger.info({"event": "ig.http.error", "url": url, "reason": _classify_error(e)})
        raise

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
