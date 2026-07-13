"""Server-side briefing consent: phrase detection + persistence."""

from __future__ import annotations

import pytest

import voice_briefing_consent as bc


@pytest.mark.parametrize(
    "text",
    [
        "stop the briefing please",
        "don't run the briefing anymore",
        "no more briefing",
        "arrête le briefing",
        "pas de briefing",
        "kein briefing mehr",
        "disattiva il briefing",
    ],
)
def test_decline_phrases_detected(text):
    assert bc.looks_like_briefing_decline(text)


@pytest.mark.parametrize(
    "text",
    ["what's on my calendar", "run the news", "tell me a joke", ""],
)
def test_non_decline_phrases_ignored(text):
    assert not bc.looks_like_briefing_decline(text)


@pytest.mark.parametrize(
    "text",
    ["enable the briefing", "always run the briefing", "active le briefing"],
)
def test_enable_phrases_detected(text):
    assert bc.looks_like_briefing_enable(text)


def test_persist_briefing_consent_writes_memory(monkeypatch):
    calls: list[tuple] = []

    def _fake_update(category, key, value):
        calls.append((category, key, value))
        return 1

    monkeypatch.setattr("assistant_memory.update_memory", _fake_update)
    assert bc.persist_briefing_consent("declined") is True
    assert calls == [("preferences", bc.STARTUP_BRIEFING_CONSENT_KEY, "declined")]


def test_persist_briefing_consent_rejects_bad_value():
    with pytest.raises(ValueError):
        bc.persist_briefing_consent("maybe")


def test_persist_briefing_consent_survives_storage_error(monkeypatch):
    def _boom(*_a, **_k):
        raise RuntimeError("db locked")

    monkeypatch.setattr("assistant_memory.update_memory", _boom)
    assert bc.persist_briefing_consent("granted") is False
