"""Typed composer messages during an active voice session."""

from voice.audio_pipeline import resolve_turn_user_text_raw


def test_resolve_turn_user_text_raw_prefers_stt() -> None:
    raw = resolve_turn_user_text_raw(
        stt_canonical="delete all work events",
        pending_typed_user_text="typed fallback",
    )
    assert raw == "delete all work events"


def test_resolve_turn_user_text_raw_falls_back_to_typed() -> None:
    raw = resolve_turn_user_text_raw(
        stt_canonical="",
        pending_typed_user_text="List my WORK events, then delete them all.",
    )
    assert raw == "List my WORK events, then delete them all."


def test_resolve_turn_user_text_raw_empty_when_both_missing() -> None:
    assert resolve_turn_user_text_raw(stt_canonical="", pending_typed_user_text="") == ""
