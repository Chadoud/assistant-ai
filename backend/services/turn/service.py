"""TurnService — single server policy for voice turn commits."""

from __future__ import annotations

import os

from .commit import resolve_user_turn_at_complete
from .schemas import ToolTurnMeta, TurnCommitResult


def turn_service_enabled() -> bool:
    """Feature flag for unified TurnService (on by default)."""
    val = os.environ.get("ASSISTANT_TURN_SERVICE", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


class TurnService:
    """Authoritative turn commit policy for voice sessions."""

    def commit(
        self,
        *,
        raw_user_text: str,
        assistant_text: str,
        recent_assistant_lines: list[str],
        tool_meta: ToolTurnMeta | None = None,
    ) -> TurnCommitResult:
        """
        Resolve whether the user bubble should commit at ``turn_complete``.

        Only this path applies junk/echo filters — clients must trust the result
        when ``serverTurn`` is present on the turn_complete frame.
        """
        assistant_norm = " ".join((assistant_text or "").split()).strip()
        if not turn_service_enabled():
            user_text = " ".join((raw_user_text or "").split()).strip()
            return TurnCommitResult(
                user_text=user_text,
                assistant_text=assistant_norm,
                user_committed=bool(user_text),
                drop_reason=None,
                user_text_raw=None,
                tool_meta=tool_meta,
            )

        user_text, user_committed, drop_reason = resolve_user_turn_at_complete(
            raw_user_text,
            assistant_text,
            recent_assistant_lines,
        )
        return TurnCommitResult(
            user_text=user_text,
            assistant_text=" ".join(assistant_text.split()).strip(),
            user_committed=user_committed,
            drop_reason=drop_reason,
            user_text_raw=raw_user_text.strip() if not user_committed else None,
            tool_meta=tool_meta,
        )


_default_service = TurnService()


def get_turn_service() -> TurnService:
    """Return the process-wide TurnService singleton."""
    return _default_service
