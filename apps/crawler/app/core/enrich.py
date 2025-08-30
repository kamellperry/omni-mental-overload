from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional


_WORD_RE = re.compile(r"[A-Za-z0-9_]+")
_KEYWORDS = {"founder", "cofounder", "building", "engineer", "cto", "developer"}


def _tokens(text: str) -> list[str]:
    text_l = (text or "").lower()
    return _WORD_RE.findall(text_l)


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        s2 = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def enrich(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal, cheap enrichment.

    Returns a dict with:
      - has_link: bool
      - recent_activity_at: datetime | None (UTC)
      - features: dict with small, stable fields
    """
    has_link = bool(profile.get("link_domains") or [])
    recent_activity_at = _parse_dt(profile.get("recent_activity_ts"))

    bio = str(profile.get("bio", ""))
    captions = profile.get("captions") or []
    captions_text = " ".join([c for c in captions if isinstance(c, str)])
    toks = _tokens(bio + " " + captions_text)

    # dedupe but keep order (cheap way)
    seen: set[str] = set()
    bio_tokens: list[str] = []
    for t in toks:
        if t not in seen:
            seen.add(t)
            bio_tokens.append(t)
        if len(bio_tokens) >= 24:  # keep small for storage
            break

    keyword_hits = sorted([k for k in _KEYWORDS if k in seen])
    has_images = bool(profile.get("images") or [])

    features = {
        "bio_tokens": bio_tokens,
        "keyword_hits": keyword_hits,
        "caption_count": len(captions),
        "has_images": has_images,
        "link_domains_count": len(profile.get("link_domains") or []),
    }

    return {
        "has_link": has_link,
        "recent_activity_at": recent_activity_at,
        "features": features,
    }

