"""Unit tests for sync E2E crypto."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "sync" / "client" / "crypto"))

from exosites_crypto import (  # noqa: E402
    build_envelope,
    content_hash,
    decrypt_record,
    derive_master_key,
    encrypt_record,
    new_record_key,
    unwrap_record_key,
    wrap_record_key,
)


def test_derive_master_key_deterministic() -> None:
    salt = b"exosites-test-salt-16b"
    a = derive_master_key("hunter2", salt)
    b = derive_master_key("hunter2", salt)
    assert a == b
    assert len(a) == 32


def test_encrypt_decrypt_roundtrip() -> None:
    key = new_record_key()
    plain = b'{"category":"notes","key":"foo","value":"bar"}'
    ct = encrypt_record(plain, key)
    assert decrypt_record(ct, key) == plain


def test_wrong_key_fails() -> None:
    key = new_record_key()
    ct = encrypt_record(b"secret", key)
    with pytest.raises(Exception):
        decrypt_record(ct, new_record_key())


def test_wrap_unwrap_record_key() -> None:
    master = derive_master_key("pw", b"salt-for-wrap-test!")
    record_key = new_record_key()
    wrapped = wrap_record_key(record_key, master)
    assert unwrap_record_key(wrapped, master) == record_key


def test_build_envelope_shape() -> None:
    key = new_record_key()
    env = build_envelope(
        collection="memory_entries",
        record_id="abc-123",
        device_id="device-1",
        logical_clock=1,
        updated_at="2026-06-11T12:00:00+00:00",
        plaintext=json.dumps({"id": 1}).encode(),
        record_key=key,
    )
    assert env["schema_version"] == 1
    assert env["collection"] == "memory_entries"
    assert env["ciphertext"]
    assert len(env["content_hash"]) == 64
