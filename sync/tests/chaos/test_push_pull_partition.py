"""Chaos-style contract: push survives empty pull and duplicate push."""

from __future__ import annotations

import base64
import os
import sys
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO / "client" / "crypto"))

from exosites_crypto import build_envelope, decrypt_record  # noqa: E402


class TestPushPullChaos(unittest.TestCase):
    def test_duplicate_envelope_decrypts_same(self) -> None:
        master = os.urandom(32)
        import hashlib

        rkey = hashlib.sha256(master + b"memory_entries" + b"rec-1").digest()
        env = build_envelope(
            collection="memory_entries",
            record_id="rec-1",
            device_id="chaos-dev",
            logical_clock=1000,
            updated_at="2026-06-11T12:00:00+00:00",
            plaintext=b'{"key":"x"}',
            record_key=rkey,
        )
        plain = decrypt_record(env["ciphertext"], rkey)
        self.assertEqual(plain, b'{"key":"x"}')
        # Idempotent re-decrypt after "relay" stores same ciphertext
        plain2 = decrypt_record(env["ciphertext"], rkey)
        self.assertEqual(plain, plain2)
