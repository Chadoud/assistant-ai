"""Tests for safe_web_url SSRF guards."""

from safe_web_url import is_public_web_url, normalize_public_web_url


def test_allows_public_https():
    assert is_public_web_url("https://example.com/path")
    assert normalize_public_web_url("example.com") == "https://example.com"


def test_blocks_loopback_and_private():
    for blocked in (
        "http://127.0.0.1/admin",
        "http://localhost:8080",
        "https://192.168.1.1",
        "http://10.0.0.5",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/",
    ):
        assert not is_public_web_url(blocked)
        assert normalize_public_web_url(blocked) is None
