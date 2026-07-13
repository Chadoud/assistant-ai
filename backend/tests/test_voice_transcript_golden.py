"""Golden-vector parity tests for voice transcript hygiene."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from voice_transcript_quality import (
    is_junk_voice_transcription,
    is_voice_transcript_noise_placeholder,
)

_FIXTURE = Path(__file__).parent / "fixtures" / "voice_transcript_golden.json"


@pytest.fixture(name="golden_vectors")
def fixture_golden_vectors() -> list[dict]:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


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
