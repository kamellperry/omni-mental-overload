import pytest

from app.core.tag_crawl_service import crawl_tag


class DummyClient:
    pass


@pytest.mark.asyncio
async def test_crawl_tag_aggregates_and_dedupes(monkeypatch):
    async def fake_list_media_by_tag(client, tag, limit=20):
        return [{"shortcode": "AAA"}, {"shortcode": "BBB"}]

    async def fake_crawl_post_comments(seed_value, cfg, client):
        if seed_value == "AAA":
            return [
                {"username": "alice", "followers": 1, "bio": "", "captions": [], "images": [], "link_domains": [], "recent_activity_ts": None},
                {"username": "bob", "followers": 2, "bio": "", "captions": [], "images": [], "link_domains": [], "recent_activity_ts": None},
            ]
        return [
            {"username": "bob", "followers": 2, "bio": "", "captions": [], "images": [], "link_domains": [], "recent_activity_ts": None},
            {"username": "carl", "followers": 3, "bio": "", "captions": [], "images": [], "link_domains": [], "recent_activity_ts": None},
        ]

    import app.io.providers.instagram as ig
    monkeypatch.setattr(ig, "list_media_by_tag", fake_list_media_by_tag)

    import app.core.tag_crawl_service as svc
    monkeypatch.setattr(svc, "crawl_post_comments", fake_crawl_post_comments)

    from app.models.crawl import CrawlConfig

    cfg = CrawlConfig(max_media_per_tag=2, mode="real")
    client = DummyClient()

    out = await crawl_tag("builders", cfg, client)  # type: ignore[arg-type]

    assert {p["username"] for p in out} == {"alice", "bob", "carl"}

