import os
import json
from typing import Any, Dict, Optional
from datetime import datetime

import asyncpg


DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/omni"
)


async def create_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(DATABASE_URL, command_timeout=15)


async def upsert_profile(
    conn: asyncpg.Connection,
    profile: Dict[str, Any],
    h: str,
    *,
    has_link: bool,
    recent_activity_at: Optional[datetime],
    features: Dict[str, Any],
) -> bool:
    """Upsert raw and features; return True if content changed.

    recent_activity_at may be a datetime or None; asyncpg will map it.
    """
    username = profile["username"]
    rec = await conn.fetchrow(
        'SELECT "contentHash" FROM "ProfileRaw" WHERE username=$1', username
    )
    if rec and rec["contentHash"] == h:
        await conn.execute(
            'UPDATE "ProfileRaw" SET "lastSeen"=now() WHERE username=$1', username
        )
        return False
    if rec:
        await conn.execute(
            'UPDATE "ProfileRaw" SET payload=$1, "lastSeen"=now(), "contentHash"=$2 WHERE username=$3',
            json.dumps(profile),
            h,
            username,
        )
    else:
        await conn.execute(
            'INSERT INTO "ProfileRaw"(username, payload, "contentHash") VALUES ($1, $2, $3)',
            username,
            json.dumps(profile),
            h,
        )

    followers = int(profile.get("followers", 0) or 0)
    await conn.execute(
        '''INSERT INTO "ProfileFeatures"(username, followers, "hasLink", "recentActivityAt", features, "versionHash")
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (username) DO UPDATE SET
             followers=EXCLUDED.followers,
             "hasLink"=EXCLUDED."hasLink",
             "recentActivityAt"=EXCLUDED."recentActivityAt",
             features=EXCLUDED.features,
             "versionHash"=EXCLUDED."versionHash",
             "updatedAt"=now()''',
        username,
        followers,
        has_link,
        recent_activity_at,
        json.dumps(features),
        h,
    )
    return True


async def get_existing_hash(conn: asyncpg.Connection, username: str) -> Optional[str]:
    rec = await conn.fetchrow(
        'SELECT "contentHash" FROM "ProfileRaw" WHERE username=$1', username
    )
    return rec["contentHash"] if rec else None
