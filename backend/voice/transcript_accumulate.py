"""Incremental Live STT accumulation — mirrors frontend voiceTranscriptQuality."""

from __future__ import annotations

import re

_NOISE_TAG = re.compile(r"^<\s*noise\s*>$", re.IGNORECASE)


def is_voice_transcript_noise_placeholder(text: str) -> bool:
    """True for empty lines and explicit STT noise placeholders."""
    stripped = " ".join(text.split()).strip()
    if not stripped:
        return True
    if _NOISE_TAG.match(stripped) or stripped.lower() == "[noise]":
        return True
    return False


def append_streaming_voice_input(previous: str, chunk: str) -> str:
    """Append one incremental Live STT chunk (Gemini often prefixes a space)."""
    if is_voice_transcript_noise_placeholder(chunk):
        return previous
    return previous + chunk
