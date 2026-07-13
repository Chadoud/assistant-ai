"""Tests for AI set-key persistence when Electron manages secrets."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from routes import ai_routes


def test_upsert_env_skips_disk_when_electron_managed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_path = tmp_path / ".env"
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    monkeypatch.setenv("EXOSITES_BACKEND_SECRETS_MANAGED", "1")
    monkeypatch.setattr(ai_routes, "_env_path", lambda: env_path)

    ai_routes._upsert_env({"GEMINI_API_KEY": "sk-live"})

    assert os.environ.get("GEMINI_API_KEY") == "sk-live"
    assert not env_path.exists()


def test_upsert_env_persists_when_not_managed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_path = tmp_path / ".env"
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    monkeypatch.delenv("EXOSITES_BACKEND_SECRETS_MANAGED", raising=False)
    monkeypatch.setattr(ai_routes, "_env_path", lambda: env_path)

    ai_routes._upsert_env({"GEMINI_API_KEY": "sk-persist"})

    assert env_path.read_text(encoding="utf-8").strip() == "GEMINI_API_KEY=sk-persist"
