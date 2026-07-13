"""Gmail token file resolution under Electron userData."""

from __future__ import annotations

from pathlib import Path

import pytest

import gmail_google_oauth as g


def test_gmail_token_file_prefers_exosites_user_data(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    assert g.gmail_token_file() == tmp_path / "gmail_oauth.json"


def test_gmail_token_file_falls_back_to_app_state_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.setattr(g, "APP_STATE_DIR", tmp_path)
    assert g.gmail_token_file() == tmp_path / "gmail_oauth.json"
