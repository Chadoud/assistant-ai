"""Operations that mutate external state and need a complete user utterance."""

from __future__ import annotations

from typing import Any

_CALENDAR_MUTATIONS = frozenset({
    "create_calendar_event",
    "create_event",
    "update_calendar_event",
    "update_event",
    "delete_calendar_event",
    "delete_event",
})
_MAIL_MUTATIONS = frozenset({"send_mail", "move_mail", "move_mail_batch", "create_filter"})
_DRIVE_MUTATIONS = frozenset({
    "move_drive_file",
    "create_drive_folder",
    "move_onedrive_file",
    "create_onedrive_folder",
})

_CONNECTOR_MUTATIONS: dict[str, frozenset[str]] = {
    "google_workspace": _CALENDAR_MUTATIONS | _MAIL_MUTATIONS | _DRIVE_MUTATIONS,
    "microsoft_graph": _CALENDAR_MUTATIONS | _MAIL_MUTATIONS | _DRIVE_MUTATIONS,
    "infomaniak_services": _CALENDAR_MUTATIONS | _MAIL_MUTATIONS,
}


def is_mutating_voice_tool(name: str, args: dict[str, Any]) -> bool:
    """True when the tool call changes user data and should wait for full STT."""
    ops = _CONNECTOR_MUTATIONS.get(name)
    if not ops:
        return name in {
            "send_message",
            "add_task",
            "complete_task",
            "save_memory",
            "plan_and_execute",
            "web_agent",
            "control_computer",
        }
    operation = str(args.get("operation", "")).strip()
    return operation in ops
