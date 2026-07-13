"""Wait for complete user speech before mutating voice tools run."""

from __future__ import annotations

import asyncio

from voice.calendar_context import resolve_speech_for_mutating_tool
from voice.history import VoiceTurn
from voice.turn_buffer import TurnBuffer, wait_for_stt_quiescence

# Mutating calendar/mail ops need enough spoken context to enrich tool args.
MIN_MUTATING_SPEECH_CHARS = 10


async def resolve_mutating_tool_speech(
    buffer: TurnBuffer,
    history: list[VoiceTurn],
    *,
    min_chars: int = MIN_MUTATING_SPEECH_CHARS,
) -> tuple[str, str | None]:
    """
    Wait for STT quiescence, merge multi-turn context, and optionally wait once more.

    Returns ``(speech_for_tools, deferred_reason)`` where ``deferred_reason`` is set
    when extra waiting was needed or the utterance is still very short.
    """
    canonical = await wait_for_stt_quiescence(buffer)
    merged = resolve_speech_for_mutating_tool(history, canonical)
    if len(merged) >= min_chars:
        return merged, None

    await asyncio.sleep(0.15)
    canonical = await wait_for_stt_quiescence(buffer)
    merged = resolve_speech_for_mutating_tool(history, canonical)
    if len(merged) >= min_chars:
        return merged, "extra_quiescence"

    if merged:
        return merged, "short_utterance"
    return merged, "empty"
