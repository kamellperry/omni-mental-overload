"""
Redis semaphore (skeleton) for per‑account concurrency caps.

Notes
- Optional dependency on redis.asyncio. If unavailable, a no‑op fallback is provided.
- Not imported by current codebase; safe for design review.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover
    Redis = None  # type: ignore


class NoopSemaphore:
    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[None]:
        yield


class RedisSemaphore:
    def __init__(self, redis: Redis, key: str, permits: int = 2, ttl_s: int = 300):
        self.redis = redis
        self.key = key
        self.permits = max(1, int(permits))
        self.ttl_s = max(10, int(ttl_s))

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[None]:
        token = "1"
        ok = await self.redis.lpush(self.key, token)
        await self.redis.expire(self.key, self.ttl_s)
        try:
            while True:
                n = await self.redis.llen(self.key)
                if n <= self.permits:
                    break
                # simple wait; callers should implement global backoff
                await self.redis.pttl(self.key)
            yield
        finally:
            try:
                await self.redis.lrem(self.key, 1, token)
            except Exception:
                pass

