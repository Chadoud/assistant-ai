"""Tests for unified TurnService (ported from voice turn/guard tests)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.turn import (
    TurnService,
    is_junk_voice_transcription,
    is_voice_transcript_noise_placeholder,
    looks_like_acoustic_echo,
    looks_like_echo_of_any,
    looks_like_echo_of_prior_assistant,
    looks_like_speaker_echo,
    looks_like_unfulfilled_promise,
    resolve_user_turn_at_complete,
)

_BACKEND_GOLDEN = (
    Path(__file__).parent / "fixtures" / "voice_transcript_golden.json"
)
_FRONTEND_GOLDEN = (
    Path(__file__).parent.parent.parent
    / "frontend"
    / "src"
    / "utils"
    / "voiceTranscriptGolden.json"
)


def test_turn_service_keeps_time_answer() -> None:
    result = TurnService().commit(
        raw_user_text="midi",
        assistant_text="",
        recent_assistant_lines=[],
    )
    assert result.user_committed is True
    assert result.user_text == "midi"
    assert result.drop_reason is None


def test_turn_service_disabled_skips_echo_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_TURN_SERVICE", "0")
    echo_like = "je l'ai ajouté à votre calendrier pour demain"
    result = TurnService().commit(
        raw_user_text=echo_like,
        assistant_text=echo_like,
        recent_assistant_lines=[echo_like],
    )
    assert result.user_committed is True
    assert result.drop_reason is None
    assert result.user_text == echo_like


def test_turn_service_keeps_actionable_speech_over_prior_calendar_paraphrase() -> None:
    user = "pour demain, pour que j'aille acheter du bourbo"
    prior = "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure."
    result = TurnService().commit(
        raw_user_text=user,
        assistant_text="",
        recent_assistant_lines=[prior],
    )
    assert result.user_committed is True
    assert result.user_text == user
    assert result.drop_reason is None


def test_turn_service_drops_junk_fragment() -> None:
    result = TurnService().commit(
        raw_user_text=" Also,",
        assistant_text="Okay.",
        recent_assistant_lines=[],
    )
    assert result.user_committed is False
    assert result.user_text == ""
    assert result.drop_reason == "junk"
    assert result.user_text_raw == "Also,"


def test_resolve_user_turn_at_complete_parity() -> None:
    text, committed, reason = resolve_user_turn_at_complete("oui", "", [])
    assert committed is True
    assert text == "oui"
    assert reason is None


def test_substring_of_assistant_is_echo() -> None:
    assistant = (
        "Désolé, je n'ai pas pu lancer votre briefing car aucune routine "
        "de démarrage n'est enregistrée."
    )
    user = "je n'ai pas pu lancer votre briefing"
    assert looks_like_speaker_echo(user, assistant) is True


def test_bourbon_request_not_echo_of_prior_calendar_reply() -> None:
    user = "pour demain, pour que j'aille acheter du bourbo"
    prior = "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure."
    assert looks_like_speaker_echo(user, prior) is False
    assert looks_like_echo_of_prior_assistant(user, prior) is False


def test_acoustic_echo_substring_still_detected() -> None:
    assistant = (
        "Désolé, je n'ai pas pu lancer votre briefing car aucune routine "
        "de démarrage n'est enregistrée."
    )
    user = "je n'ai pas pu lancer votre briefing"
    assert looks_like_acoustic_echo(user, assistant) is True
    assert looks_like_echo_of_prior_assistant(user, assistant) is True


def test_echo_of_any_checks_multiple_candidates() -> None:
    assert looks_like_echo_of_any(
        "qu'une routine de démarrage",
        "",
        "aucune routine de démarrage n'est enregistrée",
    )


@pytest.mark.parametrize(
    "text",
    [
        "I'll navigate to the site and check that for you.",
        "Je vais naviguer vers Anthropic et chercher les crédits.",
        "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure.",
    ],
)
def test_detects_unfulfilled_promises(text: str) -> None:
    assert looks_like_unfulfilled_promise(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "Your next meeting is at 3 PM.",
        "Je ne peux pas faire ça.",
        "Okay.",
    ],
)
def test_ignores_non_promises(text: str) -> None:
    assert looks_like_unfulfilled_promise(text) is False


@pytest.fixture(name="golden_vectors")
def fixture_golden_vectors() -> list[dict]:
    return json.loads(_BACKEND_GOLDEN.read_text(encoding="utf-8"))


def test_golden_junk_vectors(golden_vectors: list[dict]) -> None:
    for row in golden_vectors:
        text = row["text"]
        assert is_junk_voice_transcription(text) is row["junk"], f"failed for {text!r}"


def test_golden_noise_placeholder_vectors(golden_vectors: list[dict]) -> None:
    for row in golden_vectors:
        if "noise_placeholder" not in row:
            continue
        text = row["text"]
        assert (
            is_voice_transcript_noise_placeholder(text) is row["noise_placeholder"]
        ), f"failed for {text!r}"


def test_frontend_golden_fixture_matches_backend() -> None:
    """CI sync check — frontend golden vectors stay aligned with backend."""
    backend = json.loads(_BACKEND_GOLDEN.read_text(encoding="utf-8"))
    frontend = json.loads(_FRONTEND_GOLDEN.read_text(encoding="utf-8"))
    assert len(backend) == len(frontend)
    for back, front in zip(backend, frontend, strict=True):
        assert back["text"] == front["text"]
        assert back["junk"] == front["junk"]
        back_noise = back.get("noise_placeholder")
        front_noise = front.get("noisePlaceholder")
        assert back_noise == front_noise
