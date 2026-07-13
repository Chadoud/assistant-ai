"""Stable device fingerprint — must match `electron/entitlement/machineId.js`."""

from __future__ import annotations

import hashlib
import json
import platform
import socket


def _norm_arch() -> str:
    m = (platform.machine() or "").lower()
    if m == "amd64":
        return "x64"
    return m


def _norm_platform() -> str:
    """Match Node `os.platform()` (win32 / darwin / linux, …)."""
    s = (platform.system() or "").lower()
    if s == "windows":
        return "win32"
    if s == "darwin":
        return "darwin"
    if s == "linux":
        return "linux"
    return s


def machine_fingerprint() -> str:
    blob = json.dumps(
        {
            "a": _norm_arch(),
            "h": str(socket.gethostname() or "").lower(),
            "p": _norm_platform(),
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
