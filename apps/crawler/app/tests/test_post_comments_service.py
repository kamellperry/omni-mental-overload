import pytest

from app.core.post_comments_service import crawl_post_comments


class DummyClient:
    pass


@pytest.mark.asyncio
async def test_crawl_post_comments_builds_profiles(monkeypatch):
    # Fakes for provider functions
    async def fake_media_id_from_shortcode(client, shortcode):
        return "123"

    async def fake_get_media_comments(client, media_id, *, max_id=None, min_id=None):
        # One page of two comments
        return {
            "comments": [
                {"user": {"username": "alice"}, "created_at_utc": "2025-01-01T00:00:00Z"},
                {"user": {"username": "bob"}, "created_at_utc": "2025-01-02T00:00:00Z"},
            ]
        }

    async def fake_get_web_profile_info(client, username):
        return {"data": {"user": {"edge_followed_by": {"count": 42}, "biography": "Hi"}}}

    import app.io.providers.instagram as ig

    monkeypatch.setattr(ig, "media_id_from_shortcode", fake_media_id_from_shortcode)
    monkeypatch.setattr(ig, "get_media_comments", fake_get_media_comments)
    monkeypatch.setattr(ig, "get_web_profile_info", fake_get_web_profile_info)

    from app.models.crawl import CrawlConfig

    cfg = CrawlConfig(max_comments_per_media=10, mode="real")
    client = DummyClient()

    out = await crawl_post_comments("https://www.instagram.com/p/ABC123/", cfg, client)  # type: ignore[arg-type]

    assert isinstance(out, list)
    assert {p["username"] for p in out} == {"alice", "bob"}
    for p in out:
        assert "followers" in p and isinstance(p["followers"], int)
        assert "recent_activity_ts" in p

