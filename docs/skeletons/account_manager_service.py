"""
Account Manager (skeleton) — FastAPI, in‑memory storage (no schema changes)

Purpose
- Private service that stores a social session bundle (cookies, UA, platform tokens)
  and returns host‑ready headers for crawls.
- This skeleton uses in‑memory storage to avoid changing any schemas. Replace with
  encrypted DB/object storage in a real service.

Security
- Bearer token check via env var ACCOUNT_MANAGER_AUTH. Do NOT run this in prod as‑is.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import os
from typing import Dict, Optional, Tuple

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel


app = FastAPI(title="Account Manager (skeleton)")


def require_auth(req: Request) -> None:
    auth = req.headers.get("authorization") or ""
    token = os.getenv("ACCOUNT_MANAGER_AUTH", "")
    if not token or not auth.lower().startswith("bearer ") or auth.split(" ", 1)[1] != token:
        raise HTTPException(status_code=401, detail="unauthorized")


@dataclass
class SessionBundle:
    cookies: Dict[str, str]
    user_agent: str
    extras: Dict[str, str] = field(default_factory=dict)  # e.g., IG tokens
    last_refreshed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# In‑memory storage: {(platform, account): SessionBundle}
STORE: Dict[Tuple[str, str], SessionBundle] = {}


class SessionIn(BaseModel):
    cookies: Dict[str, str]
    user_agent: str
    extras: Optional[Dict[str, str]] = None


class HeadersOut(BaseModel):
    am_header_version: str = "1"
    headers: Dict[str, str]


def _build_headers(platform: str, host: str, s: SessionBundle) -> Dict[str, str]:
    """Return host‑ready headers from a stored bundle.

    Account Manager ONLY emits Cookie/UA/tokens; crawler adds Referer/Origin/XHR for www.
    """
    h: Dict[str, str] = {
        "User-Agent": s.user_agent,
        # Join cookie map into a single Cookie header
        "Cookie": "; ".join([f"{k}={v}" for k, v in s.cookies.items() if v is not None]),
    }
    # Mirror csrftoken → X‑CSRFToken if present (IG convenience)
    if "csrftoken" in s.cookies:
        h["X-CSRFToken"] = s.cookies["csrftoken"]
    # Include platform tokens as provided (IG examples)
    for k in ("X-IG-WWW-Claim", "X-ASBD-ID", "X-Instagram-AJAX", "x-ig-app-id"):
        v = s.extras.get(k) if s.extras else None
        if v:
            h[k] = v
    # Provide a default app id for IG web if missing (safe default)
    if platform == "ig" and "x-ig-app-id" not in h:
        h["x-ig-app-id"] = "936619743392459"
    return h


@app.post("/v1/accounts/{platform}/{account}/session", dependencies=[Depends(require_auth)])
def save_session(platform: str, account: str, body: SessionIn):
    STORE[(platform, account)] = SessionBundle(
        cookies=body.cookies,
        user_agent=body.user_agent,
        extras=body.extras or {},
        last_refreshed_at=datetime.now(timezone.utc),
    )
    return {"ok": True}


@app.get("/v1/accounts/{platform}/{account}/headers", response_model=HeadersOut, dependencies=[Depends(require_auth)])
def get_headers(platform: str, account: str, host: str = Query(...)):
    s = STORE.get((platform, account))
    if not s:
        raise HTTPException(status_code=404, detail="session_not_found")
    return HeadersOut(headers=_build_headers(platform, host, s))


@app.post("/v1/accounts/{platform}/{account}/refresh", dependencies=[Depends(require_auth)])
def refresh(platform: str, account: str):
    s = STORE.get((platform, account))
    if not s:
        raise HTTPException(status_code=404, detail="session_not_found")
    # Skeleton: in a real service, call PyDoll to refresh cookies/tokens and update bundle
    s.last_refreshed_at = datetime.now(timezone.utc)
    return {"ok": True, "refreshed_at": s.last_refreshed_at.isoformat()}


@app.get("/v1/accounts/{platform}/{account}/status", dependencies=[Depends(require_auth)])
def status(platform: str, account: str):
    s = STORE.get((platform, account))
    if not s:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {
        "health": "ok",
        "last_refreshed_at": s.last_refreshed_at.isoformat(),
        "expires_at": None,
        "notes": "skeleton",
    }


@app.get("/health")
def health():
    return {"ok": True}

