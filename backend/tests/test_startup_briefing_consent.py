"""Startup briefing consent: ask once, then remember yes/no."""

from __future__ import annotations

from voice.briefing import (
    build_ask_startup_message,
    build_auto_startup_message,
    get_startup_briefing_consent,
    resolve_startup_briefing_mode,
)


def test_resolve_startup_briefing_mode_without_routine():
    assert resolve_startup_briefing_mode(None, None) == "skip"
    assert resolve_startup_briefing_mode("", "granted") == "skip"


def test_resolve_startup_briefing_mode_auto_when_granted():
    routine = "news headlines and weather for Geneva"
    assert resolve_startup_briefing_mode(routine, "granted") == "auto"


def test_resolve_startup_briefing_mode_skip_when_declined():
    routine = "news headlines"
    assert resolve_startup_briefing_mode(routine, "declined") == "skip"


def test_resolve_startup_briefing_mode_ask_when_unset():
    routine = "calendar for today"
    assert resolve_startup_briefing_mode(routine, None) == "ask"


def test_build_ask_startup_message_waits_for_consent():
    msg = build_ask_startup_message("news and weather for Geneva")
    assert "ask" in msg.lower()
    assert "do not fetch" in msg.lower() or "do not start" in msg.lower()


def test_build_auto_startup_message_fetches_immediately():
    msg = build_auto_startup_message("news and weather for Geneva")
    assert "fetching" in msg.lower()


def test_get_startup_briefing_consent_treats_ask_as_unset(monkeypatch):
    monkeypatch.setattr(
        "voice.briefing.startup.load_memory",
        lambda: {"preferences": {"startup_briefing_consent": "ask"}},
    )
    assert get_startup_briefing_consent() is None
