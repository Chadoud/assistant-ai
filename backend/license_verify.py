"""Offline Ed25519 license verification (same format as Electron)."""

from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from entitlement_constants import EMBEDDED_LICENSE_PUBLIC_KEY_HEX, LICENSE_PREFIX, PRODUCT_SLUG
from machine_fingerprint import machine_fingerprint


def _canonical_payload(obj: dict[str, Any]) -> str:
    keys = sorted(obj.keys())
    ordered = {k: obj[k] for k in keys}
    return json.dumps(ordered, separators=(",", ":"), sort_keys=True)


def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_license_key(license_key: str) -> tuple[bool, str | None, dict | None]:
    """Returns (ok, reason_code, payload_or_none)."""
    trimmed = (license_key or "").strip()
    if not trimmed:
        return False, "empty", None
    parts = trimmed.split(".")
    if len(parts) != 3 or parts[0] != LICENSE_PREFIX:
        return False, "format", None
    try:
        raw = _b64url_decode(parts[1]).decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return False, "payload", None
    if not isinstance(payload, dict):
        return False, "payload", None
    if payload.get("product") != PRODUCT_SLUG:
        return False, "product", None
    if payload.get("tier") != "full":
        return False, "tier", None
    fp = machine_fingerprint()
    if payload.get("machine_id") != fp:
        return False, "machine", None
    message = _canonical_payload(payload).encode("utf-8")
    try:
        sig = _b64url_decode(parts[2])
    except Exception:
        return False, "sig_format", None
    if len(sig) != 64:
        return False, "sig_len", None
    pub_bytes = bytes.fromhex(EMBEDDED_LICENSE_PUBLIC_KEY_HEX)
    pub = Ed25519PublicKey.from_public_bytes(pub_bytes)
    try:
        pub.verify(sig, message)
    except InvalidSignature:
        return False, "sig_verify", None
    return True, None, payload
