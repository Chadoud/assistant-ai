"""Cross-client logical clock contract — Python reference values."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[0] / "fixtures" / "logical_clock.json"


def _logical_clock(updated_at: str, record_id: str) -> int:
    """Mirror of backend/sync_engine.py — keep in sync with mobile SyncCrypto.logicalClock."""
    try:
        ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        base = int(ts.timestamp())
    except ValueError:
        base = 0
    tail = int(hashlib.sha256(record_id.encode()).hexdigest()[:8], 16) % 1000
    return base * 1000 + tail


def test_logical_clock_golden_vectors() -> None:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    for case in data["cases"]:
        clock = _logical_clock(case["updated_at"], case["record_id"])
        assert clock == case["expected_clock"], case["record_id"]


def test_logical_clock_tail_is_sha256_mod_1000() -> None:
    record_id = "abc-123"
    updated_at = "2026-06-11T12:00:00+00:00"
    clock = _logical_clock(updated_at, record_id)
    ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
    base = int(ts.timestamp()) * 1000
    tail = int(hashlib.sha256(record_id.encode()).hexdigest()[:8], 16) % 1000
    assert clock == base + tail
