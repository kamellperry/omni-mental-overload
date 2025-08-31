import pytest


@pytest.mark.parametrize(
    "url,expect_web",
    [
        ("https://www.instagram.com/api/v1/media/shortcode/ABC/", True),
        ("https://www.instagram.com/graphql/query/", True),
        ("https://i.instagram.com/api/v1/media/shortcode/ABC/", False),
    ],
)
def test_build_headers_host_aware(url, expect_web):
    from app.io.http_headers import build_headers

    cfg_headers = {
        "User-Agent": "Mozilla/5.0 test",
        "Cookie": "csrftoken=tok123; sessionid=sess456",
    }
    out = build_headers(url, cfg_headers)

    # Cookie preserved but we don't assert exact value to avoid printing secrets
    assert "Cookie" in out
    # CSRF derived from cookie when not explicitly provided
    assert out.get("X-CSRFToken") == "tok123"

    if expect_web:
        assert out.get("X-Requested-With") == "XMLHttpRequest"
        assert out.get("Origin") == "https://www.instagram.com"
        assert out.get("Referer") == "https://www.instagram.com/"
    else:
        assert "X-Requested-With" not in out
        assert out.get("Origin") != "https://www.instagram.com"


def test_build_headers_cookie_jar_merges():
    from app.io.http_headers import build_headers

    url = "https://www.instagram.com/api/v1/media/shortcode/ABC/"
    cfg_headers = {"Cookie": "csrftoken=tokA; sessionid=old"}
    jar = {"sessionid": "new", "ds_user_id": "123"}
    out = build_headers(url, cfg_headers, cookie_jar=jar)

    # sessionid should be updated to new from jar, and ds_user_id included
    cookie = out.get("Cookie", "")
    assert "sessionid=new" in cookie
    assert "ds_user_id=123" in cookie
    assert "csrftoken=tokA" in cookie
