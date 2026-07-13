"""Backward-compatible re-exports — canonical logic lives in ``services.turn``."""

from services.turn.commit import resolve_user_turn_at_complete

__all__ = ["resolve_user_turn_at_complete"]
