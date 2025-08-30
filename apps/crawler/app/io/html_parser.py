from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

from selectolax.parser import HTMLParser


def _text_nodes(html: HTMLParser, limit: int = 8) -> List[str]:
    parts: List[str] = []
    # Prefer meta description, then headings and first paragraphs
    meta_desc = html.css_first('meta[name="description"], meta[property="og:description"]')
    if meta_desc:
        content = meta_desc.attributes.get('content')
        if content:
            parts.append(content.strip())
    for sel in ['h1', 'h2', 'h3', 'p']:
        for n in html.css(sel):
            txt = (n.text() or '').strip()
            if txt:
                parts.append(txt)
                if len(parts) >= limit:
                    return parts[:limit]
    return parts[:limit]


def _images(html: HTMLParser, base_url: str, limit: int = 3):
    out = []
    for n in html.css('img'):
        src = n.attributes.get('src')
        if not src:
            continue
        u = urljoin(base_url, src)
        w = n.attributes.get('width')
        h = n.attributes.get('height')
        out.append({'url': u, 'w': int(w) if (w and w.isdigit()) else None, 'h': int(h) if (h and h.isdigit()) else None})
        if len(out) >= limit:
            break
    return out


def _link_domains(html: HTMLParser, base_url: str, limit: int = 20) -> List[str]:
    domains: List[str] = []
    seen = set()
    for n in html.css('a'):
        href = n.attributes.get('href')
        if not href:
            continue
        u = urljoin(base_url, href)
        host = urlparse(u).hostname or ''
        if host and host not in seen:
            seen.add(host)
            domains.append(host)
        if len(domains) >= limit:
            break
    return domains


def extract_from_html(url: str, html_text: str) -> Dict[str, Any]:
    parser = HTMLParser(html_text)
    title_node = parser.css_first('meta[property="og:title"], title')
    title = (title_node.attributes.get('content') if title_node and 'content' in title_node.attributes else (title_node.text() if title_node else '')) or ''

    texts = _text_nodes(parser, limit=8)
    images = _images(parser, url, limit=3)
    link_domains = _link_domains(parser, url, limit=20)

    # Use URL as stable key when no explicit username exists
    username = url

    return {
        'username': username,
        'followers': 0,
        'bio': title or (texts[0] if texts else ''),
        'captions': texts,
        'images': images,
        'link_domains': link_domains,
        'recent_activity_ts': None,
    }

