"""Tests for calendar provider tool resolution."""

from __future__ import annotations

import pytest

from services.calendar.provider import resolve_calendar_tool_name


def test_resolve_prefers_explicit_tool() -> None:
    assert resolve_calendar_tool_name("microsoft_graph") == "microsoft_graph"


def test_resolve_microsoft_when_only_microsoft_connected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.calendar.provider.list_connected_providers",
        lambda: ["microsoft"],
    )
    assert resolve_calendar_tool_name() == "microsoft_graph"


def test_resolve_google_when_google_connected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.calendar.provider.list_connected_providers",
        lambda: ["google-calendar", "microsoft"],
    )
    assert resolve_calendar_tool_name() == "google_workspace"


def test_resolve_defaults_google_when_no_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "services.calendar.provider.list_connected_providers",
        lambda: [],
    )
    assert resolve_calendar_tool_name() == "google_workspace"
