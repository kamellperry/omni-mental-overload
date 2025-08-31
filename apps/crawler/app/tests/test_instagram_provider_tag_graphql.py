import pytest


class DummyClient:
    def __init__(self, pages):
        self.pages = pages
        self.calls = 0

    async def get_json(self, url: str):
        # Return successive GraphQL pages regardless of the URL
        if self.calls < len(self.pages):
            page = self.pages[self.calls]
            self.calls += 1
            return page
        return {
            "data": {
                "hashtag": {
                    "edge_hashtag_to_media": {"edges": [], "page_info": {"has_next_page": False}}
                }
            }
        }


@pytest.mark.asyncio
async def test_list_media_by_tag_graphql(monkeypatch):
    # Enable env-only GraphQL hashtag path
    monkeypatch.setenv("IG_GRAPHQL_ENABLE", "true")
    monkeypatch.setenv("CRAWLER_IG_GQL_HASHTAG_HASH", "dummyhash")
    # Minimal GraphQL-like structures
    p1 = {
        "data": {
            "hashtag": {
                "edge_hashtag_to_media": {
                    "edges": [
                        {"node": {"shortcode": "SC1", "product_type": "clips"}},
                        {"node": {"shortcode": "SC2", "product_type": "feed"}},
                    ],
                    "page_info": {"has_next_page": True, "end_cursor": "CUR1"},
                }
            }
        }
    }
    p2 = {
        "data": {
            "hashtag": {
                "edge_hashtag_to_media": {
                    "edges": [
                        {"node": {"shortcode": "SC3", "product_type": "clips"}},
                    ],
                    "page_info": {"has_next_page": False, "end_cursor": None},
                }
            }
        }
    }

    client = DummyClient([p1, p2])

    import app.io.providers.instagram as ig

    # reels only
    out = await ig.list_media_by_tag(client, "builders", limit=3, media_types=["reel"])  # type: ignore[arg-type]
    assert [x["shortcode"] for x in out] == ["SC1", "SC3"]
    # both (default)
    out2 = await ig.list_media_by_tag(client, "builders", limit=3)  # type: ignore[arg-type]
    assert [x["shortcode"] for x in out2] == ["SC1", "SC2", "SC3"]
