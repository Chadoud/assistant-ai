"""Canonical user utterance buffer for one Gemini Live turn."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from voice.transcript_accumulate import append_streaming_voice_input

# How long STT must be idle before a mutating tool may run.
STT_QUIESCENCE_S = 0.6
# Hard cap when waiting for late transcription chunks.
STT_QUIESCENCE_MAX_WAIT_S = 1.5


@dataclass
class TurnBuffer:
    """Accumulates input_transcription deltas into one canonical user line."""

    canonical: str = ""
    chunks: list[str] = field(default_factory=list)
    last_chunk_at: float = 0.0

    def append_chunk(self, chunk: str) -> str:
        """Append a delta chunk; return the updated canonical line."""
        if not chunk:
            return self.canonical
        self.chunks.append(chunk)
        self.canonical = append_streaming_voice_input(self.canonical, chunk).strip()
        self.last_chunk_at = time.monotonic()
        return self.canonical

    def seconds_since_last_chunk(self) -> float:
        if self.last_chunk_at <= 0:
            return float("inf")
        return time.monotonic() - self.last_chunk_at

    def clear(self) -> None:
        self.canonical = ""
        self.chunks.clear()
        self.last_chunk_at = 0.0


async def wait_for_stt_quiescence(
    buffer: TurnBuffer,
    *,
    quiescence_s: float = STT_QUIESCENCE_S,
    max_wait_s: float = STT_QUIESCENCE_MAX_WAIT_S,
) -> str:
    """
    Block until the utterance has been quiet long enough for late STT to arrive.

    Returns the canonical text to use for tool enrichment.
    """
    import asyncio

    deadline = time.monotonic() + max_wait_s
    while time.monotonic() < deadline:
        if buffer.seconds_since_last_chunk() >= quiescence_s:
            break
        await asyncio.sleep(0.05)
    return buffer.canonical
