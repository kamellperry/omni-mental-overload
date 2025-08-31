"""
Prometheus metrics skeleton with graceful no‑op fallback.

- Not imported by current codebase; safe to review.
"""
from __future__ import annotations

try:
    from prometheus_client import Counter, Histogram
except Exception:  # pragma: no cover
    class _Noop:
        def labels(self, *_, **__):
            return self
        def observe(self, *_: float):
            return None
        def inc(self, *_: float):
            return None
    Counter = Histogram = lambda *a, **k: _Noop()  # type: ignore


headers_get_latency = Histogram(
    "headers_get_latency_seconds",
    "Account Manager headers GET latency",
    labelnames=("platform", "account", "host"),
)

headers_refresh_latency = Histogram(
    "headers_refresh_latency_seconds",
    "Account Manager refresh latency",
    labelnames=("platform", "account"),
)

auth_expired_total = Counter(
    "auth_expired_total",
    "Count of auth_expired events",
    labelnames=("platform", "account"),
)

rate_limited_total = Counter(
    "rate_limited_total",
    "Count of rate_limited events",
    labelnames=("host",),
)

