"""Token relay provider allowlist."""

import pytest

from connector_credentials import (
    RELAY_PROVIDER_IDS,
    get_token,
    store_token,
)


def test_store_token_rejects_unknown_provider():
    with pytest.raises(ValueError, match="not allowed"):
        store_token("evil-provider", "token", 60)


def test_store_token_accepts_known_provider():
    from connector_credentials import _token_cache

    _token_cache.clear()
    store_token("slack", "test-token", 3600)
    assert get_token("slack") == "test-token"
    _token_cache.clear()


def test_relay_provider_ids_include_google_aliases():
    assert "google-gmail" in RELAY_PROVIDER_IDS
    assert "google" in RELAY_PROVIDER_IDS
    assert "microsoft" in RELAY_PROVIDER_IDS
