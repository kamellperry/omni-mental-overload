"""
Logging redactor (skeleton): removes secrets from logs.

- Not imported by current codebase; safe to review.
"""
from __future__ import annotations

import logging
import re
from typing import Iterable


SENSITIVE_KEYS = (
    "cookie",
    "authorization",
    "x-ig-www-claim",
    "x-asbd-id",
    "x-instagram-ajax",
    "x-ig-app-id",
)


class RedactFilter(logging.Filter):
    def __init__(self, keys: Iterable[str] = SENSITIVE_KEYS):
        super().__init__()
        self._keys = tuple(k.lower() for k in keys)

    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.getMessage())
        for k in self._keys:
            # crude redaction: key=value → key=[REDACTED]
            msg = re.sub(rf"({re.escape(k)}\s*[:=]\s*)([^;\s]+)", r"\1[REDACTED]", msg, flags=re.I)
        record.msg = msg
        return True


def install_redaction(level: int = logging.INFO) -> None:
    root = logging.getLogger()
    root.setLevel(level)
    f = RedactFilter()
    for h in root.handlers:
        h.addFilter(f)

