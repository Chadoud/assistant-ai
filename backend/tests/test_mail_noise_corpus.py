"""Eval-style regression tests for mail noise corpus."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from signal_quality import SignalTier, evaluate_gmail_message

_CORPUS = Path(__file__).parent / "fixtures" / "mail_noise_corpus.json"


@pytest.mark.parametrize("case", json.loads(_CORPUS.read_text(encoding="utf-8")))
def test_mail_noise_corpus(case: dict) -> None:
    verdict = evaluate_gmail_message(
        label_ids=case.get("labels") or [],
        from_addr=case.get("from", ""),
        subject=case.get("subject", ""),
        snippet=case.get("snippet", ""),
    )
    expected = case["expect"]
    if expected == "reject":
        assert verdict.tier == SignalTier.REJECT
    elif expected == "allow":
        assert verdict.tier in (SignalTier.ALLOW, SignalTier.QUARANTINE)
