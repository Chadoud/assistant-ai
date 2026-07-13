"""Block navigation to private/loopback hosts from LLM-driven browser automation."""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse

_BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata.google.internal",
        "169.254.169.254",
    }
)


def is_public_web_url(url: str) -> bool:
    """
    Return True when *url* uses http(s) and targets a non-private host.

    Used by web_agent to prevent SSRF to loopback or RFC1918 services.
    """
    raw = (url or "").strip()
    if not raw:
        return False
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        return False
    try:
        parsed = urlparse(raw)
    except Exception:
        return False
    if parsed.scheme.lower() not in ("http", "https"):
        return False
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False
    if host in _BLOCKED_HOSTNAMES or host.endswith(".localhost"):
        return False
    if host in ("127.0.0.1", "0.0.0.0", "::1", "[::1]"):
        return False
    try:
        addr = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return True
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
    )


def normalize_public_web_url(url: str) -> str | None:
    """Normalize *url* or return None when navigation must be blocked."""
    raw = (url or "").strip()
    if not raw:
        return None
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = f"https://{raw}"
    return raw if is_public_web_url(raw) else None
