"""Tests for multi-turn calendar speech context merging."""

from voice.calendar_context import (
    is_time_only_voice_reply,
    resolve_speech_for_mutating_tool,
)


def test_midi_is_time_only_reply():
    assert is_time_only_voice_reply("midi") is True
    assert is_time_only_voice_reply("à midi") is True


def test_merge_time_follow_up_with_prior_create_request():
    history = [
        {
            "user": "un événement pour demain pour que j'aille faire du paddle avec Alexandre.",
            "assistant": "À quelle heure et pendant combien de temps ?",
        }
    ]
    merged = resolve_speech_for_mutating_tool(history, "midi")
    assert "paddle" in merged.lower()
    assert "à midi" in merged.lower()


def test_long_utterance_is_not_merged():
    history = [{"user": "create event tomorrow", "assistant": "What time?"}]
    current = "I want paddle with Alexandre tomorrow at noon for one hour"
    assert resolve_speech_for_mutating_tool(history, current) == current
