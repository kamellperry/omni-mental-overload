from typing import Any, Dict, Literal, Optional, List
from pydantic import BaseModel
from pydantic import field_validator


class CrawlConfig(BaseModel):
    max_profiles: int = 100
    max_comments_per_media: int = 200
    max_media_per_tag: int = 20
    mode: Literal['fake', 'real'] = 'fake'
    request_timeout_s: float = 10.0
    retries: int = 2
    backoff_s: float = 0.25
    concurrency: int = 5
    per_domain_limit: int = 2
    proxy: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    # Optional media type filter for tag seeds. Defaults to both when empty/missing.
    media_types: Optional[List[str]] = None

    @field_validator('media_types', mode='before')
    @classmethod
    def _normalize_media_types(cls, v: Any) -> Optional[List[str]]:
        if v is None:
            return None
        if isinstance(v, (str,)):
            vals = [v]
        elif isinstance(v, (list, tuple)):
            vals = list(v)
        else:
            return None
        norm: list[str] = []
        for x in vals:
            s = str(x).strip().lower()
            if not s:
                continue
            if s in ("reel", "reels", "clip", "clips"):
                t = "reel"
            elif s in ("post", "posts"):
                t = "post"
            else:
                # ignore unknowns for compatibility
                continue
            if t not in norm:
                norm.append(t)
        # Treat empty as None (i.e., both)
        return norm or None


class CrawlRequest(BaseModel):
    seed_type: str
    seed_value: str
    crawl_config: CrawlConfig = CrawlConfig()
