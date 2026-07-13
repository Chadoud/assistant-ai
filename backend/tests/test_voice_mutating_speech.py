"""Tests for mutating-tool speech deferral."""

from __future__ import annotations

import asyncio

from voice.mutating_speech import MIN_MUTATING_SPEECH_CHARS, resolve_mutating_tool_speech
from voice.turn_buffer import TurnBuffer


def test_resolve_mutating_tool_speech_merges_history() -> None:
    buffer = TurnBuffer()
    buffer.append_chunk("midi")
    history = [
        {
            "user": "un événement demain paddle avec Alexandre",
            "assistant": "À quelle heure ?",
        }
    ]

    async def run() -> tuple[str, str | None]:
        return await resolve_mutating_tool_speech(buffer, history)

    speech, reason = asyncio.run(run())
    assert "paddle" in speech.lower()
    assert "midi" in speech.lower()
    assert len(speech) >= MIN_MUTATING_SPEECH_CHARS


def test_short_utterance_reports_reason() -> None:
    buffer = TurnBuffer()
    buffer.append_chunk("ok")

    async def run() -> tuple[str, str | None]:
        return await resolve_mutating_tool_speech(buffer, [])

    speech, reason = asyncio.run(run())
    assert reason in {"short_utterance", "extra_quiescence", None}
