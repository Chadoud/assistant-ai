"""Tests for Mark-parity tools (weather, file workspace, voice end, analyze stub, dev scaffold)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from actions import (
    analyze_local_file,
    dev_scaffold,
    end_voice_session,
    file_workspace,
    weather_report,
)
from voice_tool_approval import VoiceToolApprovalWaiter


def test_weather_report_success(monkeypatch: pytest.MonkeyPatch) -> None:
    urls: list[str] = []

    def get(url: str, params=None):
        urls.append(str(url))
        r = MagicMock()
        r.raise_for_status = MagicMock()
        r.json.return_value = {
            "current": {
                "temperature_2m": 21.5,
                "relative_humidity_2m": 50,
                "weather_code": 0,
                "wind_speed_10m": 10.0,
            }
        }
        return r

    mock_client = MagicMock()
    mock_client.get = get
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_client
    mock_ctx.__exit__.return_value = None

    def client_factory(*_a, **_k):
        return mock_ctx

    monkeypatch.setattr(weather_report.httpx, "Client", client_factory)
    out = weather_report.weather_report({"latitude": 46.5, "longitude": 6.6})
    assert out["ok"] is True
    assert "Clear" in out["data"]["summary"]
    assert out["data"]["temperature_c"] == 21.5
    assert "api.open-meteo.com" in urls[0]


def test_weather_report_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def get(url: str, params=None):
        r = MagicMock()
        r.raise_for_status.side_effect = Exception("network")
        return r

    mock_client = MagicMock()
    mock_client.get = get
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_client
    mock_ctx.__exit__.return_value = None

    monkeypatch.setattr(weather_report.httpx, "Client", lambda *_a, **_k: mock_ctx)
    out = weather_report.weather_report({"latitude": 46.5, "longitude": 6.6})
    assert out["ok"] is False


def test_file_workspace_mkdir_and_move(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(file_workspace.Path, "home", lambda: tmp_path)
    sub = tmp_path / "sub"
    out = file_workspace.file_workspace({"action": "mkdir", "path": str(sub)})
    assert out["ok"] is True
    assert sub.is_dir()
    src = tmp_path / "a.txt"
    src.write_text("hi", encoding="utf-8")
    dest = sub / "a.txt"
    out2 = file_workspace.file_workspace(
        {"action": "move", "path": str(src), "destination": str(dest)}
    )
    assert out2["ok"] is True
    assert not src.exists()
    assert dest.read_text(encoding="utf-8") == "hi"


def test_end_voice_session_returns_stop_voice() -> None:
    out = end_voice_session.end_voice_session({})
    assert out["ok"] is True
    assert out["data"]["action"] == "stop_voice"


def test_analyze_local_file_no_gemini_text_fallback(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    # tmp_path is under /tmp on Linux, outside home — anchor the action's home check to it.
    monkeypatch.setattr(analyze_local_file, "_home", lambda: tmp_path)
    p = tmp_path / "x.txt"
    p.write_text("hello", encoding="utf-8")
    out = analyze_local_file.analyze_local_file({"path": str(p)})
    assert out["ok"] is True
    assert "no answer model configured" in out["data"].get("note", "")
    assert "hello" in (out["data"].get("answer") or "")


def test_dev_scaffold_generates_and_runs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dev_scaffold.Path, "home", lambda: tmp_path)
    out = dev_scaffold.dev_scaffold_project(
        {"description": "demo scaffold", "project_name": "demo_proj"}
    )
    assert out["ok"] is True
    proj = tmp_path / ".ai-manager" / "codegen" / "demo_proj"
    assert (proj / "main.py").is_file()
    assert "Hello from" in (out.get("data") or {}).get("stdout", "")


def test_voice_tool_approval_session_grant() -> None:
    waiter = VoiceToolApprovalWaiter()
    assert waiter.screen_capture_session_active() is False
    waiter.grant_screen_capture_session(ttl_seconds=60.0)
    assert waiter.screen_capture_session_active() is True
