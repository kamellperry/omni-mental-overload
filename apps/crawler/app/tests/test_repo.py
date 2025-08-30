import pytest

from app.core.hash import content_hash
from app.core.enrich import enrich
from app.io.db import upsert_profile


class FakeConn:
    def __init__(self, content_hash_row=None):
        self._content_hash_row = content_hash_row
        self.exec_calls = []

    async def fetchrow(self, _sql, _username):
        return self._content_hash_row

    async def execute(self, sql, *args):
        self.exec_calls.append((sql, args))
        return "OK"


@pytest.mark.asyncio
async def test_upsert_profile_new_record_inserts_raw_and_features():
    profile = {'username': 'new_user', 'followers': 1, 'bio': 'hi'}
    h = content_hash(profile)
    conn = FakeConn(content_hash_row=None)  # no existing row
    e = enrich(profile)
    changed = await upsert_profile(
        conn, profile, h,
        has_link=e['has_link'], recent_activity_at=e['recent_activity_at'], features=e['features']
    )

    assert changed is True
    # first write inserts raw
    assert any('INSERT INTO "ProfileRaw"' in sql for (sql, _) in conn.exec_calls)
    # and features are written
    assert any('INSERT INTO "ProfileFeatures"' in sql for (sql, _) in conn.exec_calls)


@pytest.mark.asyncio
async def test_upsert_profile_unchanged_only_bumps_last_seen():
    profile = {'username': 'same_user', 'followers': 10, 'bio': 'same'}
    h = content_hash(profile)
    # existing row with same contentHash
    conn = FakeConn(content_hash_row={'contentHash': h})
    e = enrich(profile)
    changed = await upsert_profile(
        conn, profile, h,
        has_link=e['has_link'], recent_activity_at=e['recent_activity_at'], features=e['features']
    )

    assert changed is False
    # should update lastSeen, not payload
    assert any('UPDATE "ProfileRaw" SET "lastSeen"' in sql for (sql, _) in conn.exec_calls)
    assert not any('SET payload=' in sql for (sql, _) in conn.exec_calls)


@pytest.mark.asyncio
async def test_upsert_profile_changed_updates_payload_and_features():
    old_profile = {'username': 'userx', 'followers': 5, 'bio': 'old'}
    new_profile = {'username': 'userx', 'followers': 5, 'bio': 'new'}
    old_h = content_hash(old_profile)
    new_h = content_hash(new_profile)
    assert old_h != new_h

    conn = FakeConn(content_hash_row={'contentHash': old_h})
    e = enrich(new_profile)
    changed = await upsert_profile(
        conn, new_profile, new_h,
        has_link=e['has_link'], recent_activity_at=e['recent_activity_at'], features=e['features']
    )

    assert changed is True
    assert any('UPDATE "ProfileRaw" SET payload=' in sql for (sql, _) in conn.exec_calls)
    assert any('INSERT INTO "ProfileFeatures"' in sql for (sql, _) in conn.exec_calls)
