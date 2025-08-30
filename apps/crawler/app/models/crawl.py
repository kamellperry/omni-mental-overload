from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel


class CrawlConfig(BaseModel):
    max_profiles: int = 100
    mode: Literal['fake', 'real'] = 'fake'
    request_timeout_s: float = 10.0
    retries: int = 2
    backoff_s: float = 0.25
    concurrency: int = 5
    per_domain_limit: int = 2
    proxy: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class CrawlRequest(BaseModel):
    seed_type: str
    seed_value: str
    crawl_config: CrawlConfig = CrawlConfig()
