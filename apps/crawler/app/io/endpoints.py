"""Canonical API endpoint constants for providers.

Keep provider endpoints here so callers can swap strategies or update
base URLs via config in one place.
"""

from typing import Final


# Instagram (web + mobile style endpoints observed in old CLI)
INSTAGRAM_WEB_PROFILE_INFO: Final[str] = (
    "https://i.instagram.com/api/v1/users/web_profile_info/"
)
INSTAGRAM_MEDIA_COMMENTS: Final[str] = (
    "https://www.instagram.com/api/v1/media/{media_id}/comments/"
)
INSTAGRAM_SEARCH_TOP: Final[str] = (
    "https://www.instagram.com/api/v1/web/search/topsearch/"
)
INSTAGRAM_USER_INFO_BY_ID: Final[str] = (
    "https://i.instagram.com/api/v1/users/{user_id}/info/"
)
INSTAGRAM_MEDIA_SHORTCODE_WEB: Final[str] = (
    "https://www.instagram.com/api/v1/media/shortcode/{shortcode}/"
)
INSTAGRAM_MEDIA_SHORTCODE_MOBILE: Final[str] = (
    "https://i.instagram.com/api/v1/media/shortcode/{shortcode}/"
)
INSTAGRAM_POST_HTML: Final[str] = "https://www.instagram.com/p/{shortcode}/"
INSTAGRAM_ACCOUNTS_EDIT: Final[str] = (
    "https://www.instagram.com/accounts/edit/"
)

# Instagram GraphQL (reverse-engineered; hashes can change)
INSTAGRAM_GRAPHQL_QUERY: Final[str] = "https://www.instagram.com/graphql/query/"
# Hashtag media listing hash commonly used by tools like Instaloader
INSTAGRAM_HASHTAG_QUERY_HASH: Final[str] = "9b498c08113f1e09617a1703c22b2f32"


__all__ = [
    "INSTAGRAM_WEB_PROFILE_INFO",
    "INSTAGRAM_MEDIA_COMMENTS",
    "INSTAGRAM_SEARCH_TOP",
    "INSTAGRAM_USER_INFO_BY_ID",
    "INSTAGRAM_MEDIA_SHORTCODE_WEB",
    "INSTAGRAM_MEDIA_SHORTCODE_MOBILE",
    "INSTAGRAM_POST_HTML",
    "INSTAGRAM_ACCOUNTS_EDIT",
    "INSTAGRAM_GRAPHQL_QUERY",
    "INSTAGRAM_HASHTAG_QUERY_HASH",
]
