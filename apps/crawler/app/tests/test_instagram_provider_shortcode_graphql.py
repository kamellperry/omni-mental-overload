import pytest


class DummyClient:
    async def get_json(self, url: str):
        # Simulate failures for web/mobile endpoints; success for GraphQL
        if "/graphql/query/" in url:
            return {"data": {"shortcode_media": {"id": "999999"}}}
        # web or mobile endpoints
        raise RuntimeError("fail")

    async def get_raw(self, url: str):
        return "text/html", "<html></html>"


@pytest.mark.asyncio
async def test_media_id_from_shortcode_graphql_fallback(monkeypatch):
    # Enable and set env hash
    monkeypatch.setenv("IG_GRAPHQL_ENABLE", "true")
    monkeypatch.setenv("CRAWLER_IG_GQL_SHORTCODE_HASH", "dummyhash")

    import app.io.providers.instagram as ig

    client = DummyClient()
    out = await ig.media_id_from_shortcode(client, "ABC123")  # type: ignore[arg-type]
    assert out == "999999"

