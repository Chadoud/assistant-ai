"""Tests for tiered activity screenshot summarization."""

from __future__ import annotations

from unittest.mock import MagicMock

import activity_vision as av
from orchestrator.vision import VisionError


def test_format_activity_user_error_maps_503():
    msg = av.format_activity_user_error(
        "503 UNAVAILABLE. high demand. Please try again later."
    )
    assert msg is not None
    assert "busy" in msg.lower()


def test_window_fallback_uses_app_and_title():
    fb = av._window_fallback("EXO", "Memory — Facts")
    assert fb is not None
    assert "EXO" in fb
    assert "Memory" in fb


def test_describe_uses_orchestrator_when_available(monkeypatch):
    av.reset_cloud_backoff_for_tests()
    monkeypatch.setattr(
        av,
        "_describe_via_orchestrator",
        lambda _img: ("Editing a spreadsheet in Excel.", None),
    )

    result = av.describe_activity_screenshot(b"jpeg", app="", title="")
    assert result.summary == "Editing a spreadsheet in Excel."
    assert result.user_error is None


def test_describe_skips_local_vision_falls_back_to_window(monkeypatch):
    av.reset_cloud_backoff_for_tests()
    monkeypatch.setattr(
        av,
        "_describe_via_orchestrator",
        lambda _img: (None, "503 UNAVAILABLE"),
    )

    result = av.describe_activity_screenshot(b"jpeg", app="Cursor", title="main.ts")
    assert result.summary is not None
    assert "Cursor" in result.summary
    assert result.user_notice is not None


def test_describe_falls_back_to_window_title(monkeypatch):
    av.reset_cloud_backoff_for_tests()
    monkeypatch.setattr(av, "_describe_via_orchestrator", lambda _img: (None, "503 UNAVAILABLE"))

    result = av.describe_activity_screenshot(b"jpeg", app="EXO", title="Memory")
    assert result.summary is not None
    assert "Memory" in result.summary
    assert result.user_error is None


def test_describe_returns_user_error_when_all_tiers_fail(monkeypatch):
    av.reset_cloud_backoff_for_tests()
    monkeypatch.setattr(av, "_describe_via_orchestrator", lambda _img: (None, "401 invalid api key"))

    result = av.describe_activity_screenshot(b"jpeg", app="", title="")
    assert result.summary is None
    assert result.user_error is not None


def test_orchestrator_integration_vision_error_is_transient(monkeypatch):
    av.reset_cloud_backoff_for_tests()
    from orchestrator import vision as vision_mod

    monkeypatch.setattr(vision_mod, "REGISTRY", MagicMock())
    monkeypatch.setattr(
        vision_mod,
        "vision_complete",
        MagicMock(side_effect=VisionError("503 UNAVAILABLE")),
    )

    summary, err = av._describe_via_orchestrator(b"img")
    assert summary is None
    assert err is not None
