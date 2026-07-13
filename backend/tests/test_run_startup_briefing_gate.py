"""run_startup_briefing honors a persisted decline unless explicitly forced."""

from __future__ import annotations

from actions.run_startup_briefing import run_startup_briefing


def test_declined_consent_blocks_briefing(monkeypatch):
    monkeypatch.setattr("voice.briefing.get_startup_briefing_consent", lambda: "declined")
    result = run_startup_briefing({})
    assert result["ok"] is False
    assert "declined" in result["error"].lower()


def test_force_overrides_declined_consent(monkeypatch):
    monkeypatch.setattr("voice.briefing.get_startup_briefing_consent", lambda: "declined")
    # _force skips the consent check; with no active gate it falls through to the
    # "voice session not active" path rather than the declined refusal.
    monkeypatch.setattr("voice_briefing_gate.get_voice_briefing_gate", lambda: None)
    result = run_startup_briefing({"_force": True})
    assert result["ok"] is False
    assert "voice session is not active" in result["error"].lower()


def test_granted_consent_allows_through_to_gate(monkeypatch):
    monkeypatch.setattr("voice.briefing.get_startup_briefing_consent", lambda: "granted")
    monkeypatch.setattr("voice_briefing_gate.get_voice_briefing_gate", lambda: None)
    result = run_startup_briefing({})
    assert result["ok"] is False
    assert "voice session is not active" in result["error"].lower()


def test_missing_startup_routine_returns_error(monkeypatch):
    monkeypatch.setattr("voice.briefing.get_startup_briefing_consent", lambda: "granted")
    monkeypatch.setattr("voice.briefing.get_startup_message", lambda: None)

    class _Gate:
        def start_from_tool_thread(self) -> dict:
            raise AssertionError("should not start pipeline without a saved routine")

    monkeypatch.setattr("voice_briefing_gate.get_voice_briefing_gate", lambda: _Gate())
    result = run_startup_briefing({})
    assert result["ok"] is False
    assert "no startup routine" in result["error"].lower()
