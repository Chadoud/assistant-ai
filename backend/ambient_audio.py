"""Optional ambient audio capture settings (Phase 3 scaffold)."""

from __future__ import annotations

from typing import Any

_ambient_enabled = False


def status() -> dict[str, Any]:
    return {"enabled": _ambient_enabled, "indicator_required": True, "raw_audio_retention": False}


def set_enabled(enabled: bool) -> dict[str, Any]:
    global _ambient_enabled
    _ambient_enabled = bool(enabled)
    return status()
