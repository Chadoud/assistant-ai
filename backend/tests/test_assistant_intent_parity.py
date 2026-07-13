"""Intent classifier parity — keep in sync with frontend assistantIntentGolden.json."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.assistant.intent import classify_intent

_BACKEND_GOLDEN = Path(__file__).parent / "fixtures" / "assistant_intent_golden.json"
_FRONTEND_GOLDEN = (
    Path(__file__).parent.parent.parent
    / "frontend"
    / "src"
    / "utils"
    / "assistantIntentGolden.json"
)


def test_frontend_golden_fixture_matches_backend() -> None:
    assert _FRONTEND_GOLDEN.is_file()
    assert json.loads(_BACKEND_GOLDEN.read_text()) == json.loads(
        _FRONTEND_GOLDEN.read_text()
    )


@pytest.mark.parametrize(
    "case",
    json.loads(_BACKEND_GOLDEN.read_text()),
    ids=lambda c: c["text"][:40],
)
def test_classify_intent_golden(case: dict) -> None:
    assert classify_intent(case["text"], case.get("previous")) == case["intent"]
