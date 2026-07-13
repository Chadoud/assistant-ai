"""Tests for server-authoritative user turn resolution."""

from voice.turn_commit import resolve_user_turn_at_complete


def test_keeps_time_answer() -> None:
    text, committed, reason = resolve_user_turn_at_complete("midi", "", [])
    assert committed is True
    assert text == "midi"
    assert reason is None


def test_keeps_actionable_speech_over_prior_calendar_paraphrase() -> None:
    user = "pour demain, pour que j'aille acheter du bourbo"
    prior = "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure."
    text, committed, reason = resolve_user_turn_at_complete(user, "", [prior])
    assert committed is True
    assert text == user
    assert reason is None


def test_drops_junk_fragment() -> None:
    text, committed, reason = resolve_user_turn_at_complete(" Also,", "Okay.", [])
    assert committed is False
    assert text == ""
    assert reason == "junk"
