import os
import pytest


class DummyClient:
    async def get_json(self, url: str):
        # Return a minimal GraphQL-like user payload regardless of URL
        return {
            "data": {
                "user": {
                    "edge_followed_by": {"count": 1234},
                    "biography": "hello world",
                }
            }
        }


@pytest.mark.asyncio
async def test_get_web_profile_info_graphql(monkeypatch):
    # Enable GraphQL and provide a dummy hash
    monkeypatch.setenv("IG_GRAPHQL_ENABLE", "true")
    monkeypatch.setenv("IG_HASH_USER_BY_USERNAME", "dummyhash")

    import app.io.providers.instagram as ig

    client = DummyClient()
    data = await ig.get_web_profile_info(client, "alice")  # type: ignore[arg-type]

    assert isinstance(data, dict)
    assert data.get("data") and data["data"].get("user")
    assert data["data"]["user"]["edge_followed_by"]["count"] == 1234

