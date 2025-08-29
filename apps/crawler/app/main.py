import os, json, hashlib, asyncio
from datetime import datetime
from typing import Dict, Any, List
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import asyncpg

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/omni")
app = FastAPI(title="Crawler")

class CrawlRequest(BaseModel):
    seed_type: str
    seed_value: str
    crawl_config: Dict[str, Any] = {"max_profiles": 100}

def canon(p: Dict[str, Any]) -> Dict[str, Any]:
    def norm_text(s: str) -> str:
        return " ".join((s or "").lower().split())
    return {
        "u": p.get("username",""),
        "fc": p.get("followers",0),
        "fg": p.get("following",0),
        "pr": bool(p.get("is_private", False)),
        "bio": norm_text(p.get("bio","")),
        "caps": [norm_text(c) for c in (p.get("captions") or [])[:5]],
        "imgs": [(i.get("url"), i.get("w"), i.get("h")) for i in (p.get("images") or [])[:3]],
        "links": sorted(p.get("link_domains") or []),
        "ra_day": (p.get("recent_activity_ts","") or "")[:10],
    }

def content_hash(p: Dict[str, Any]) -> str:
    blob = json.dumps(canon(p), separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()

async def upsert_profile(conn, profile: Dict[str, Any]):
    h = content_hash(profile)
    username = profile["username"]
    rec = await conn.fetchrow('SELECT "contentHash" FROM "ProfileRaw" WHERE username=$1', username)
    if rec and rec["contentHash"] == h:
        await conn.execute('UPDATE "ProfileRaw" SET "lastSeen"=now() WHERE username=$1', username)
        return h, False
    if rec:
        await conn.execute(
            'UPDATE "ProfileRaw" SET payload=$1, "lastSeen"=now(), "contentHash"=$2 WHERE username=$3',
            json.dumps(profile), h, username
        )
    else:
        await conn.execute(
            'INSERT INTO "ProfileRaw"(username, payload, "contentHash") VALUES ($1, $2, $3)',
            username, json.dumps(profile), h
        )
    followers = int(profile.get("followers", 0) or 0)
    await conn.execute(
        '''INSERT INTO "ProfileFeatures"(username, followers, features, "versionHash")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (username) DO UPDATE SET
             followers=EXCLUDED.followers,
             features=EXCLUDED.features,
             "versionHash"=EXCLUDED."versionHash",
             "updatedAt"=now()''',
        username, followers, json.dumps({"bio_tokens": []}), h
    )
    return h, True

async def fake_scrape(seed_type: str, seed_value: str, max_profiles: int) -> List[Dict[str, Any]]:
    out = []
    for i in range(min(max_profiles, 10)):
        out.append({
            "username": f"user_{seed_value}_{i}",
            "followers": 100 + i,
            "bio": "founder of something",
            "captions": ["building things"],
            "images": [{"url": f"https://img/{i}.jpg", "w": 1000, "h": 1000}],
            "recent_activity_ts": datetime.utcnow().isoformat()
        })
    await asyncio.sleep(0.05)
    return out

@app.post("/crawl/jobs")
async def crawl(req: CrawlRequest, tasks: BackgroundTasks):
    async def run():
        conn = await asyncpg.connect(DB_URL)
        try:
            profiles = await fake_scrape(req.seed_type, req.seed_value, req.crawl_config.get("max_profiles", 100))
            for p in profiles:
                await upsert_profile(conn, p)
        finally:
            await conn.close()
    tasks.add_task(run)
    return {"status": "queued"}

@app.get("/health")
def health():
    return {"ok": True}
