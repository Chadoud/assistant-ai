"""Tests for app token validation."""

from __future__ import annotations

import pytest

from app_auth import (
    app_token_auth_enabled,
    is_insecure_local_mode,
    validate_app_token,
)


@pytest.fixture(autouse=True)
def secure_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("EXOSITES_APP_TOKEN", "test-secret-token")


def test_validate_app_token_accepts_matching_token() -> None:
    assert validate_app_token("test-secret-token") is True


def test_validate_app_token_rejects_wrong_token() -> None:
    assert validate_app_token("wrong") is False


def test_insecure_local_disables_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXOSITES_INSECURE_LOCAL", "1")
    monkeypatch.delenv("EXOSITES_APP_TOKEN", raising=False)
    monkeypatch.delenv("EXOSITES_REQUIRE_APP_TOKEN", raising=False)
    assert is_insecure_local_mode() is True
    assert app_token_auth_enabled() is False
    assert validate_app_token("") is True


def test_require_app_token_fails_closed_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.delenv("EXOSITES_APP_TOKEN", raising=False)
    monkeypatch.setenv("EXOSITES_REQUIRE_APP_TOKEN", "1")
    assert app_token_auth_enabled() is True
    assert validate_app_token("") is False
    assert validate_app_token("anything") is False


def test_require_app_token_overrides_insecure_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXOSITES_INSECURE_LOCAL", "1")
    monkeypatch.setenv("EXOSITES_REQUIRE_APP_TOKEN", "1")
    monkeypatch.setenv("EXOSITES_APP_TOKEN", "packaged-token")
    assert app_token_auth_enabled() is True
    assert validate_app_token("packaged-token") is True
    assert validate_app_token("wrong") is False
