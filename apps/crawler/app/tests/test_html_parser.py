from app.io.html_parser import extract_from_html


def test_extract_from_html_basic():
    html = """
    <html>
      <head>
        <title>Sample Page</title>
        <meta name="description" content="Short description here" />
      </head>
      <body>
        <h1>Hello World</h1>
        <p>First paragraph with content.</p>
        <img src="/img/a.jpg" width="600" height="400" />
        <a href="https://example.com/about">About</a>
      </body>
    </html>
    """

    prof = extract_from_html("https://site.test/page", html)

    assert prof["username"] == "https://site.test/page"
    assert prof["bio"] in ("Short description here", "Sample Page")
    assert len(prof["captions"]) >= 1
    assert prof["images"][0]["url"].startswith("https://site.test/")
    assert "example.com" in prof["link_domains"]

