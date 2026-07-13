"""Assistant service package — unified text chat turn routing."""

from .intent import (
    AssistantIntent,
    classify_intent,
    is_mail_write_intent,
    merge_calendar_write_context,
)
from .turn import (
    AssistantTurnResult,
    handle_assistant_turn,
    turn_result_to_json,
    unified_turn_enabled,
)

__all__ = [
    "AssistantIntent",
    "AssistantTurnResult",
    "classify_intent",
    "handle_assistant_turn",
    "is_mail_write_intent",
    "merge_calendar_write_context",
    "turn_result_to_json",
    "unified_turn_enabled",
]
