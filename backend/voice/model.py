"""Gemini Live model id resolution for voice sessions."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Match Mark-XXXIX's LIVE_MODEL exactly; use -latest alias so the session
# always runs on the current stable build without requiring a code change when
# Google rotates preview snapshots.
GEMINI_VOICE_MODEL_DEFAULT = "models/gemini-2.5-flash-native-audio-latest"


def resolve_gemini_voice_model(raw: str | None = None) -> str:
    """Return a Gemini Live native-audio model id.

    Chat models such as ``gemini-2.5-flash`` reject ``CONTENT_TYPE_AUDIO`` and
    leave the mic stuck reconnecting with an empty chat. Prefer the env override
    only when it looks Live-audio capable; otherwise fall back to the default.
    """
    candidate = (raw if raw is not None else os.environ.get("GEMINI_VOICE_MODEL", "")).strip()
    if not candidate:
        return GEMINI_VOICE_MODEL_DEFAULT
    low = candidate.lower()
    if "native-audio" in low or "-live" in low or "/live" in low or low.startswith("live"):
        if not candidate.startswith("models/") and "/" not in candidate:
            return f"models/{candidate}"
        return candidate
    logger.warning(
        "GEMINI_VOICE_MODEL=%r is not Live-audio capable; using %s",
        candidate,
        GEMINI_VOICE_MODEL_DEFAULT,
    )
    return GEMINI_VOICE_MODEL_DEFAULT
