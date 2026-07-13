"""Push notification registration scaffold (Firebase/APNs via cloud relay)."""

from __future__ import annotations

from typing import Any


def register_push_token(device_id: str, token: str, platform: str) -> dict[str, Any]:
    """Store push token on sync device record (relay handles delivery)."""
    return {"ok": True, "device_id": device_id, "platform": platform, "registered": bool(token)}
