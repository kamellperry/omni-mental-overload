from __future__ import annotations

from typing import Dict, Optional
from urllib.parse import urlparse
from http.cookies import SimpleCookie


def _parse_cookie_header(cookie_header: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not cookie_header:
        return out
    sc = SimpleCookie()
    try:
        sc.load(cookie_header)
    except Exception:
        # Fallback: naive split; last value wins
        parts = [p.strip() for p in cookie_header.split(";") if p.strip()]
        for p in parts:
            if "=" in p:
                k, v = p.split("=", 1)
                out[k.strip()] = v.strip()
        return out
    for k, morsel in sc.items():
        out[k] = morsel.value
    return out


def _build_cookie_header(jar: Dict[str, str]) -> Optional[str]:
    if not jar:
        return None
    parts = [f"{k}={v}" for k, v in jar.items() if v is not None]
    return "; ".join(parts) if parts else None


def build_headers(
    url: str,
    base_headers: Optional[Dict[str, str]] = None,
    *,
    cookie_jar: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """Build host-aware headers for a request.

    - Merges provided `base_headers` (e.g., from CrawlConfig.headers)
    - Adds/overrides per-host requirements:
      - www.instagram.com: add X-CSRFToken (from cookies), X-Requested-With, Origin, Referer
      - i.instagram.com: keep minimal; do not inject web-only headers
    - Builds Cookie header from the union of provided Cookie header + in-memory cookie_jar.

    Never logs or returns anything other than the final header map.
    """
    headers: Dict[str, str] = {}
    if base_headers:
        headers.update(base_headers)

    # Normalize common header keys: allow case-insensitive access
    # but keep existing casing for outward headers if already present.
    cookie_from_cfg = None
    for k in list(headers.keys()):
        if k.lower() == "cookie":
            cookie_from_cfg = headers.pop(k)
            break

    # Merge cookies: config Cookie + cookie_jar (jar wins)
    cookie_map: Dict[str, str] = {}
    if cookie_from_cfg:
        cookie_map.update(_parse_cookie_header(cookie_from_cfg))
    if cookie_jar:
        cookie_map.update(cookie_jar)
    merged_cookie_header = _build_cookie_header(cookie_map)
    if merged_cookie_header:
        headers["Cookie"] = merged_cookie_header

    host = urlparse(url).hostname or ""

    # Add CSRF from cookies if not explicitly set
    has_csrf = any(k.lower() == "x-csrftoken" for k in headers.keys())
    if not has_csrf and "csrftoken" in cookie_map:
        headers["X-CSRFToken"] = cookie_map["csrftoken"]

    # Web host specific headers
    if host.endswith("www.instagram.com") or host == "www.instagram.com":
        # Add typical web XHR headers where safe
        headers.setdefault("X-Requested-With", "XMLHttpRequest")
        headers.setdefault("Origin", "https://www.instagram.com")
        headers.setdefault("Referer", "https://www.instagram.com/")
        # Optionally set Instagram web app id if not present
        headers.setdefault("x-ig-app-id", "936619743392459")
    # Mobile host: avoid web-only headers (no-op)

    return headers


__all__ = ["build_headers"]
