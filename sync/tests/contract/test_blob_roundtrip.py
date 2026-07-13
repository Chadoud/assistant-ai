"""Contract test: blob envelope roundtrip through crypto layer."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "client" / "crypto"))

from exosites_crypto import build_envelope, decrypt_record, new_record_key  # noqa: E402


def test_golden_envelope_roundtrip() -> None:
    key = new_record_key()
    plain = json.dumps({"category": "notes", "key": "test", "value": "hello"}).encode()
    env = build_envelope(
        collection="memory_entries",
        record_id="1",
        device_id="desktop-test",
        logical_clock=1,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=plain,
        record_key=key,
    )
    restored = decrypt_record(env["ciphertext"], key)
    assert restored == plain
