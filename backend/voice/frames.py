"""JSON frame helpers for voice WebSocket delivery."""

from __future__ import annotations

import json
from typing import Any


def frame(type_: str, **payload: Any) -> str:
    """Serialize a typed JSON frame for the voice WebSocket client."""
    return json.dumps({"type": type_, **payload})
