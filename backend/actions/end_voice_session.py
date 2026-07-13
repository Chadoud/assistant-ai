"""Signal the client to end the voice session (no OS shutdown)."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def end_voice_session(_parameters: dict[str, Any]) -> dict[str, Any]:
    """Voice UI should stop the microphone when result contains action stop_voice."""
    logger.debug("[action] end_voice_session called")
    return {
        "ok": True,
        "data": {
            "action": "stop_voice",
            "message": "Voice session will end.",
        },
    }
