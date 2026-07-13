"""Tests for Gmail OAuth client credential resolution."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import gmail_google_oauth as g


def test_credentials_from_installed_json():
    raw = {
        "installed": {
            "client_id": "abc.apps.googleusercontent.com",
            "client_secret": "secret-value",
        }
    }
    assert g._credentials_from_installed_json(raw) == ("abc.apps.googleusercontent.com", "secret-value")


def test_google_client_credentials_from_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("EXOSITES_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("EXOSITES_GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON", raising=False)
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)

    p = tmp_path / "gmail_oauth_client.json"
    p.write_text(
        json.dumps(
            {
                "installed": {
                    "client_id": "id-from-file.apps.googleusercontent.com",
                    "client_secret": "from-file-secret",
                }
            }
        ),
        encoding="utf-8",
    )
    assert g.google_client_credentials() == ("id-from-file.apps.googleusercontent.com", "from-file-secret")


def test_google_client_credentials_oauth_client_id_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("EXOSITES_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("EXOSITES_GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON", raising=False)
    monkeypatch.setenv("EXOSITES_GOOGLE_OAUTH_CLIENT_ID", "desktop-id.apps.googleusercontent.com")
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)
    assert g.google_client_credentials() == ("desktop-id.apps.googleusercontent.com", "")


def test_google_client_credentials_oauth_client_id_with_shared_secret(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("EXOSITES_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("EXOSITES_GOOGLE_OAUTH_CLIENT_JSON", raising=False)
    monkeypatch.setenv("EXOSITES_GOOGLE_OAUTH_CLIENT_ID", "desktop-id.apps.googleusercontent.com")
    monkeypatch.setenv("EXOSITES_GOOGLE_CLIENT_SECRET", "shared-secret")
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)
    assert g.google_client_credentials() == ("desktop-id.apps.googleusercontent.com", "shared-secret")


def test_google_client_credentials_env_overrides_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)
    (tmp_path / "gmail_oauth_client.json").write_text(
        json.dumps({"installed": {"client_id": "wrong", "client_secret": "wrong"}}),
        encoding="utf-8",
    )
    monkeypatch.setenv("EXOSITES_GOOGLE_CLIENT_ID", "env-id.apps.googleusercontent.com")
    monkeypatch.setenv("EXOSITES_GOOGLE_CLIENT_SECRET", "env-secret")
    assert g.google_client_credentials() == ("env-id.apps.googleusercontent.com", "env-secret")


def test_oauth_redirect_uri_override(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("EXOSITES_GMAIL_OAUTH_REDIRECT_URI", "http://localhost:9999/oauth2")
    assert g.oauth_redirect_uri() == "http://localhost:9999/oauth2"
    monkeypatch.delenv("EXOSITES_GMAIL_OAUTH_REDIRECT_URI", raising=False)
    monkeypatch.setenv("EXOSITES_GMAIL_OAUTH_PORT", "8789")
    assert g.oauth_redirect_uri() == "http://127.0.0.1:8789/callback"
