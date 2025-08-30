import json
import hashlib
from typing import Any, Dict, List, Tuple


def _norm_text(s: str) -> str:
    return " ".join((s or "").lower().split())


def canon(p: Dict[str, Any]) -> Dict[str, Any]:
    imgs: List[Tuple[str | None, Any, Any]] = [
        (i.get("url"), i.get("w"), i.get("h")) for i in (p.get("images") or [])[:3]
    ]
    return {
        "u": p.get("username", ""),
        "fc": p.get("followers", 0),
        "fg": p.get("following", 0),
        "pr": bool(p.get("is_private", False)),
        "bio": _norm_text(p.get("bio", "")),
        "caps": [_norm_text(c) for c in (p.get("captions") or [])[:5]],
        "imgs": imgs,
        "links": sorted(p.get("link_domains") or []),
        "ra_day": (p.get("recent_activity_ts", "") or "")[:10],
    }


def content_hash(p: Dict[str, Any]) -> str:
    blob = json.dumps(canon(p), separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()

