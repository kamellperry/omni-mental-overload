import asyncio
import importlib
import json
import os
import random
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


DEFAULT_HEADERS: Dict[str, str] = {
    'user-agent': 'OmniCrawler/0.1 (+https://example.com)',
    'accept': 'application/json, */*;q=0.8',
}


class _HostLimiter:
    _locks: Dict[str, asyncio.Semaphore] = {}

    @classmethod
    def get(cls, host: str, limit: int) -> asyncio.Semaphore:
        sem = cls._locks.get(host)
        if sem is None:
            sem = asyncio.Semaphore(max(1, int(limit)))
            cls._locks[host] = sem
        return sem


async def fake_fetch(
    seed_type: str, seed_value: str, max_profiles: int
) -> List[Dict[str, Any]]:
    """Return fake profiles for walking skeleton and tests."""
    return [
        {
            'username': f'user_{seed_value}_{i}',
            'followers': 100 + i,
            'bio': 'founder of something',
            'captions': ['building things'],
            'images': [{'url': f'https://img/{i}.jpg', 'w': 1000, 'h': 1000}],
            'recent_activity_ts': datetime.utcnow().isoformat(),
        }
        for i in range(min(max_profiles, 10))
    ]


class HttpClient:
    def __init__(
        self,
        headers: Optional[Dict[str, str]] = None,
        proxy: Optional[str] = None,
        timeout_s: float = 10.0,
        retries: int = 2,
        backoff_s: float = 0.25,
        per_domain_limit: int = 2,
    ) -> None:
        self.headers: Dict[str, str] = {**DEFAULT_HEADERS, **(headers or {})}
        self.proxy = proxy
        self.timeout_s = timeout_s
        self.retries = retries
        self.backoff_s = backoff_s
        self.per_domain_limit = max(1, int(per_domain_limit))

    async def _acquire_host(self, url: str) -> Optional[asyncio.Semaphore]:
        host = urlparse(url).hostname or ''
        if not host:
            return None
        sem = _HostLimiter.get(host, self.per_domain_limit)
        await sem.acquire()
        return sem

    async def get_json(self, url: str) -> Any:
        """GET JSON with retries, timeout, and jittered backoff.

        Uses curl_cffi.requests.AsyncSession lazily to avoid mypy issues.
        """
        last_err: Optional[BaseException] = None
        for attempt in range(self.retries + 1):
            try:
                req = importlib.import_module('curl_cffi.requests')  # type: ignore[import-untyped]
                sem = await self._acquire_host(url)
                try:
                    async with req.AsyncSession() as s:  # type: ignore[attr-defined]
                        proxies = None
                        if self.proxy:
                            proxies = {'http': self.proxy, 'https': self.proxy}
                        r = await s.get(
                            url,
                            headers=self.headers,
                            timeout=self.timeout_s,
                            proxies=proxies,
                        )
                        # curl_cffi Response mimics requests API
                        if r.status_code >= 400:  # type: ignore[attr-defined]
                            raise RuntimeError(f'HTTP {r.status_code} for {url}')  # type: ignore[attr-defined]
                        ctype = r.headers.get('content-type', '')  # type: ignore[attr-defined]
                        if 'json' in ctype:
                            return r.json()  # type: ignore[attr-defined]
                        # try to parse anyway
                        try:
                            return json.loads(r.text)  # type: ignore[attr-defined]
                        except Exception as _:
                            return None
                finally:
                    if sem is not None:
                        sem.release()
            except BaseException as e:  # retry on any failure; upper layers decide next
                last_err = e
                if attempt >= self.retries:
                    break
                # exponential backoff with jitter
                delay = self.backoff_s * (2**attempt) + random.random() * self.backoff_s
                await asyncio.sleep(delay)
        if last_err is not None:
            raise RuntimeError(f'GET failed after retries: {url}') from last_err
        return None

    async def get_raw(self, url: str) -> Tuple[str, str]:
        """GET raw text with content-type and retries/backoff."""
        last_err: Optional[BaseException] = None
        for attempt in range(self.retries + 1):
            try:
                req = importlib.import_module('curl_cffi.requests')  # type: ignore[import-untyped]
                sem = await self._acquire_host(url)
                try:
                    async with req.AsyncSession() as s:  # type: ignore[attr-defined]
                        proxies = None
                        if self.proxy:
                            proxies = {'http': self.proxy, 'https': self.proxy}
                        r = await s.get(
                            url,
                            headers=self.headers,
                            timeout=self.timeout_s,
                            proxies=proxies,
                        )
                        if r.status_code >= 400:  # type: ignore[attr-defined]
                            raise RuntimeError(f'HTTP {r.status_code} for {url}')  # type: ignore[attr-defined]
                        ctype = r.headers.get('content-type', '')  # type: ignore[attr-defined]
                        text = r.text  # type: ignore[attr-defined]
                        return ctype, text
                finally:
                    if sem is not None:
                        sem.release()
            except BaseException as e:
                last_err = e
                if attempt >= self.retries:
                    break
                delay = self.backoff_s * (2**attempt) + random.random() * self.backoff_s
                await asyncio.sleep(delay)
        if last_err is not None:
            raise RuntimeError(f'GET failed after retries: {url}') from last_err
        return '', ''


def _extract_items(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for key in ('profiles', 'items', 'data'):
            v = data.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


def _to_profile(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    username = (
        item.get('username')
        or item.get('user')
        or item.get('handle')
        or item.get('id')
        or ''
    )
    if not username:
        return None
    followers = item.get('followers') or item.get('followers_count') or 0
    bio = item.get('bio') or item.get('description') or ''
    captions = item.get('captions') or []
    images = item.get('images') or []
    link_domains = item.get('link_domains') or item.get('links') or []
    ra = item.get('recent_activity_ts') or item.get('recent_activity') or None
    if ra is None and item.get('updated_at'):
        ra = item['updated_at']
    return {
        'username': str(username),
        'followers': int(followers or 0),
        'bio': str(bio),
        'captions': captions if isinstance(captions, list) else [],
        'images': images if isinstance(images, list) else [],
        'link_domains': link_domains if isinstance(link_domains, list) else [],
        'recent_activity_ts': str(ra) if ra is not None else None,
    }


async def real_fetch(
    seed_type: str,
    seed_value: str,
    max_profiles: int,
    client: HttpClient,
) -> List[Dict[str, Any]]:
    """Basic real fetcher.

    - Supports seed_type 'url': fetch JSON directly from the provided URL.
    - For other seed types, looks for URL templates in env and uses them if present:
      - CRAWLER_TAG_URL_TEMPLATE (e.g., https://api.example.com/tag/{value})
      - CRAWLER_USER_URL_TEMPLATE (e.g., https://api.example.com/user/{value})
    Returns mapped profiles, truncated to max_profiles.
    """
    url: Optional[str] = None
    if seed_type == 'url':
        url = seed_value
    elif seed_type == 'tag':
        tpl = os.getenv('CRAWLER_TAG_URL_TEMPLATE')
        if tpl:
            url = tpl.format(value=seed_value)
    elif seed_type == 'user':
        tpl = os.getenv('CRAWLER_USER_URL_TEMPLATE')
        if tpl:
            url = tpl.format(value=seed_value)

    if not url:
        return []

    # Try JSON first; if that fails or content-type indicates HTML, fall back to HTML parse
    try:
        data = await client.get_json(url)
        items = _extract_items(data)
        out: List[Dict[str, Any]] = []
        for it in items:
            p = _to_profile(it)
            if p:
                out.append(p)
            if len(out) >= max_profiles:
                break
        if out:
            return out
    except Exception:
        pass

    # HTML path
    from .html_parser import extract_from_html  # local import to keep import cost low

    ctype, text = await client.get_raw(url)
    if 'html' in (ctype or '').lower() and text:
        prof = extract_from_html(url, text)
        return [prof]
    return []
