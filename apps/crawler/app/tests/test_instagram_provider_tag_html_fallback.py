import pytest


class DummyClient:
    def __init__(self, html: str):
        self.html = html

    async def get_json(self, url: str):
        # Force HTML path by returning non-JSON
        raise RuntimeError("force html")

    async def get_raw(self, url: str):
        return "text/html", self.html


@pytest.mark.asyncio
async def test_list_media_by_tag_html_finds_post_and_reel():
    html = """
    <html>
      <a href="/p/ABC123/">post</a>
      <a href="/reel/XYZ789/">reel</a>
    </html>
    """
    client = DummyClient(html)

    import app.io.providers.instagram as ig

    out = await ig.list_media_by_tag(client, "solar", limit=10)  # type: ignore[arg-type]
    shortcodes = {x["shortcode"] for x in out}
    assert "ABC123" in shortcodes
    assert "XYZ789" in shortcodes


@pytest.mark.asyncio
async def test_list_media_by_tag_html_filters_by_media_types():
    html = """
    <html>
      <a href="/p/ABC123/">post</a>
      <a href="/reel/XYZ789/">reel</a>
    </html>
    """
    client = DummyClient(html)

    import app.io.providers.instagram as ig

    # posts only
    out_posts = await ig.list_media_by_tag(client, "solar", limit=10, media_types=["post"])  # type: ignore[arg-type]
    assert [x["shortcode"] for x in out_posts] == ["ABC123"]

    # reels only
    out_reels = await ig.list_media_by_tag(client, "solar", limit=10, media_types=["reel"])  # type: ignore[arg-type]
    assert [x["shortcode"] for x in out_reels] == ["XYZ789"]
