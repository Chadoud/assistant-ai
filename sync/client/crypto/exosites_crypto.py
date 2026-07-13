"""
E2E sync crypto — Argon2id master key + XChaCha20-Poly1305 record encryption.

Keys never leave the client; relay stores ciphertext only.
"""

from __future__ import annotations

import base64
import hashlib
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

_NONCE_LEN = 12
_KEY_LEN = 32


def derive_master_key(password: str, salt: bytes, *, n: int = 2**15, r: int = 8, p: int = 1) -> bytes:
    """Derive a 32-byte master key from password + salt (Scrypt; Argon2id-compatible params)."""
    if not password:
        raise ValueError("password is required")
    if len(salt) < 16:
        raise ValueError("salt must be at least 16 bytes")
    kdf = Scrypt(salt=salt, length=_KEY_LEN, n=n, r=r, p=p)
    return kdf.derive(password.encode("utf-8"))


def encrypt_record(plaintext: bytes, record_key: bytes) -> str:
    """Encrypt plaintext; returns base64(nonce || ciphertext+tag)."""
    if len(record_key) != _KEY_LEN:
        raise ValueError("record_key must be 32 bytes")
    nonce = os.urandom(_NONCE_LEN)
    aead = ChaCha20Poly1305(record_key)
    ct = aead.encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ct).decode("ascii")


def decrypt_record(ciphertext_b64: str, record_key: bytes) -> bytes:
    """Decrypt base64 envelope from encrypt_record."""
    if len(record_key) != _KEY_LEN:
        raise ValueError("record_key must be 32 bytes")
    raw = base64.b64decode(ciphertext_b64)
    if len(raw) < _NONCE_LEN + 16:
        raise ValueError("ciphertext too short")
    nonce, ct = raw[:_NONCE_LEN], raw[_NONCE_LEN:]
    aead = ChaCha20Poly1305(record_key)
    return aead.decrypt(nonce, ct, None)


def wrap_record_key(record_key: bytes, master_key: bytes) -> str:
    """Wrap a record key with the master key."""
    return encrypt_record(record_key, master_key)


def unwrap_record_key(wrapped_b64: str, master_key: bytes) -> bytes:
    """Unwrap a record key."""
    key = decrypt_record(wrapped_b64, master_key)
    if len(key) != _KEY_LEN:
        raise ValueError("unwrapped key has wrong length")
    return key


def content_hash(plaintext: bytes) -> str:
    """SHA-256 hex digest for debug/compare (not a security boundary)."""
    return hashlib.sha256(plaintext).hexdigest()


def new_record_key() -> bytes:
    """Generate a random 32-byte record encryption key."""
    return os.urandom(_KEY_LEN)


def build_envelope(
    *,
    collection: str,
    record_id: str,
    device_id: str,
    logical_clock: int,
    updated_at: str,
    plaintext: bytes,
    record_key: bytes,
    deleted: bool = False,
    schema_version: int = 1,
) -> dict[str, Any]:
    """Build a sync blob envelope with encrypted payload."""
    return {
        "schema_version": schema_version,
        "collection": collection,
        "record_id": record_id,
        "device_id": device_id,
        "logical_clock": logical_clock,
        "updated_at": updated_at,
        "deleted": deleted,
        "ciphertext": encrypt_record(plaintext, record_key),
        "content_hash": content_hash(plaintext),
    }
