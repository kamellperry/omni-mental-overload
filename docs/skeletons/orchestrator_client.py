"""
Orchestrator → Account Manager client (skeleton)

- Not imported by current codebase; safe for review.
- Uses httpx to call private Account Manager endpoints.
"""
from __future__ import annotations

import os
from typing import Dict

import httpx


BASE = os.getenv("ACCOUNT_MANAGER_BASE_URL", "http://localhost:9001")
TOKEN = os.getenv("ACCOUNT_MANAGER_AUTH", "changeme")


def _auth_headers() -> Dict[str, str]:
    return {"authorization": f"Bearer {TOKEN}", "accept": "application/json"}


async def get_headers(platform: str, account: str, host: str) -> Dict[str, str]:
    url = f"{BASE.rstrip('/')}/v1/accounts/{platform}/{account}/headers"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params={"host": host}, headers=_auth_headers())
        r.raise_for_status()
        data = r.json() or {}
        # Expected shape: { am_header_version: "1", headers: {...} }
        return data.get("headers", {})


async def refresh(platform: str, account: str) -> None:
    url = f"{BASE.rstrip('/')}/v1/accounts/{platform}/{account}/refresh"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, headers=_auth_headers())
        r.raise_for_status()

