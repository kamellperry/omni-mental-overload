from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Settings:
    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/omni")

    # Generic provider URL templates (can be overridden per env)
    tag_url_template: Optional[str] = os.getenv("CRAWLER_TAG_URL_TEMPLATE")
    user_url_template: Optional[str] = os.getenv("CRAWLER_USER_URL_TEMPLATE")

    # HTTP client tuning
    request_timeout_s: float = float(os.getenv("CRAWLER_REQUEST_TIMEOUT_S", "10.0"))
    retries: int = int(os.getenv("CRAWLER_RETRIES", "2"))
    backoff_s: float = float(os.getenv("CRAWLER_BACKOFF_S", "0.25"))
    per_domain_limit: int = int(os.getenv("CRAWLER_PER_DOMAIN_LIMIT", "2"))

    # Optional proxy for all requests (pool support can be added later)
    proxy: Optional[str] = os.getenv("CRAWLER_PROXY")

    # Optional impersonation fingerprint (e.g., "chrome120"); wired later
    impersonate: Optional[str] = os.getenv("CRAWLER_IMPERSONATE")


def load_settings() -> Settings:
    return Settings()

