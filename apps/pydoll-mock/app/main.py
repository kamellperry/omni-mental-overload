from __future__ import annotations

import os
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def _rand_id(prefix: str = 'pd_acc_', n: int = 8) -> str:
    return prefix + ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))


APP_TOKEN = os.getenv('PYDOLL_AUTH_TOKEN', 'devtoken')
ACCOUNTS: Dict[str, Dict[str, Optional[str]]] = {}


class Credentials(BaseModel):
    username: str
    password: str


class CreateAccountRequest(BaseModel):
    platform: str
    credentials: Credentials
    proxy: Optional[str] = None


app = FastAPI(title='PyDoll Mock')


@app.get('/health')
def health():
    return {'ok': True, 'time': _now_iso()}


def _check_auth(authorization: Optional[str]):
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='missing_bearer')
    token = authorization.split(' ', 1)[1]
    if token != APP_TOKEN:
        raise HTTPException(status_code=403, detail='invalid_bearer')


@app.post('/v1/accounts')
def create_account(req: CreateAccountRequest, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    if req.platform != 'instagram':
        raise HTTPException(status_code=400, detail='unsupported_platform')
    pid = _rand_id()
    ACCOUNTS[pid] = {'proxy': req.proxy}
    return {'id': pid}


@app.post('/v1/accounts/{providerAccountId}/sessions/refresh')
def refresh_session(providerAccountId: str, host: str, authorization: Optional[str] = Header(default=None)):
    _check_auth(authorization)
    if providerAccountId not in ACCOUNTS:
        raise HTTPException(status_code=404, detail='not_found')
    if host not in ('www.instagram.com', 'i.instagram.com'):
        raise HTTPException(status_code=400, detail='invalid_host')
    ua = (
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/125.0 Safari/537.36'
    )
    cookie_jar = {'sessionid': 'mock_session', 'csrftoken': 'mock_csrf'}
    headers = {'User-Agent': ua, 'Cookie': 'sessionid=mock_session; csrftoken=mock_csrf'}
    proxy = ACCOUNTS[providerAccountId].get('proxy')
    exp = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat().replace('+00:00', 'Z')
    return {
        'userAgent': ua,
        'headers': headers,
        'cookieJar': cookie_jar,
        'proxy': proxy,
        'expiresAt': exp,
        'providerSessionId': 'mock_psid',
    }

