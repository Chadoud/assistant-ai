"""Turn commit contract shared by voice WebSocket frames and clients."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ToolTurnMeta:
    """Optional tool context attached to a committed turn."""

    tool_name: str | None = None
    tool_operation: str | None = None
    tool_ok: bool | None = None


@dataclass
class TurnCommitResult:
    """Canonical server-authoritative turn_complete payload."""

    user_text: str
    assistant_text: str
    user_committed: bool
    drop_reason: str | None
    user_text_raw: str | None
    tool_meta: ToolTurnMeta | None = None
