"""Client-synced pending calendar delete draft for voice session rehydration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from services.calendar.delete_confirm import draft_from_payload
from voice.tool_dispatch import ToolDispatchState


@dataclass
class PendingDeleteSyncHolder:
    """Mutable holder updated from the voice WebSocket receive loop."""

    draft: dict[str, Any] | None = field(default=None)


def hydrate_dispatch_pending_delete(
    dispatch_state: ToolDispatchState,
    holder: PendingDeleteSyncHolder | None,
) -> None:
    """Restore RAM-only pending delete from the client's conversation draft."""
    if holder is None or not holder.draft:
        return
    if dispatch_state.pending_calendar_delete is not None:
        return
    try:
        dispatch_state.pending_calendar_delete = draft_from_payload(holder.draft)
        dispatch_state.calendar_awaiting_confirm = True
    except Exception:
        holder.draft = None


def pending_delete_blocks_briefing(holder: PendingDeleteSyncHolder | None) -> bool:
    """True when a client-synced delete draft is awaiting user input."""
    return bool(holder and holder.draft and holder.draft.get("awaitingConfirm"))
