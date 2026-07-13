"""Autonomy policy — what the agent may do on its own vs. what needs a human.

The autonomous loop can now plan and call real tools, so it needs a gate: read-only
and reversible actions run freely; anything that sends, deletes, spends, or controls
the machine is *sensitive* and is withheld for confirmation unless explicitly allowed.
Unknown tools fail **closed** (treated as sensitive), so new tools are safe by default.

Risk is decided by tool name first, then — for connector tools that multiplex many
operations behind one name — by the ``operation``/``action`` argument verb.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Risk(str, Enum):
    SAFE = "safe"            # read-only / trivially reversible — auto-allowed
    SENSITIVE = "sensitive"  # side effects — needs confirmation for autonomous use
    BLOCKED = "blocked"      # never run autonomously


# Tools that only read or are trivially reversible.
_SAFE_TOOLS = frozenset({
    "list_directory", "terminal_safe", "get_running_apps", "read_file",
    "web_search", "weather_report", "analyze_local_file", "screen_capture",
    "youtube_video", "flight_finder", "review_and_suggest",
})

# Tools whose every action has real-world side effects.
_SENSITIVE_TOOLS = frozenset({
    "os_control", "control_computer", "code_runner", "dev_scaffold_project",
    "send_message", "open_app", "close_app", "file_workspace", "computer_settings",
    "desktop_environment", "manage_connection", "schedule_reminder", "save_memory",
    "system_volume", "start_local_file_sort", "run_google_drive_workspace_sort",
})

# Guard against unbounded self-recursion regardless of risk tier.
_BLOCKED_TOOLS = frozenset({"plan_and_execute", "end_voice_session"})

# Connector tools multiplex operations; verbs decide the risk of the call.
_CONNECTOR_TOOLS = frozenset({
    "google_workspace", "microsoft_graph", "dropbox_files", "slack_messaging", "whatsapp_messaging",
    "s3_storage", "infomaniak_services", "icloud_drive", "notion", "browser_control",
})

# Operation/action verbs that mutate, send, or remove → sensitive.
_WRITE_VERBS = (
    "send", "move", "delete", "create", "update", "copy", "append", "remove",
    "write", "upload", "type", "click", "go_to", "submit",
)


def _operation_of(args: dict) -> str:
    for key in ("operation", "action"):
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def classify(tool: str, args: dict | None = None) -> Risk:
    """Return the risk tier for a tool call (name first, then operation verb)."""
    name = (tool or "").strip()
    args = args or {}
    if name in _BLOCKED_TOOLS:
        return Risk.BLOCKED
    if name in _CONNECTOR_TOOLS:
        operation = _operation_of(args)
        if not operation:
            return Risk.SENSITIVE  # ambiguous → fail closed
        return Risk.SENSITIVE if operation.startswith(_WRITE_VERBS) else Risk.SAFE
    if name in _SAFE_TOOLS:
        return Risk.SAFE
    if name in _SENSITIVE_TOOLS:
        return Risk.SENSITIVE
    return Risk.SENSITIVE  # unknown tools fail closed


@dataclass
class Decision:
    allowed: bool
    risk: Risk
    reason: str


@dataclass
class AutonomyPolicy:
    """Decides whether a tool call may run without a human in the loop."""

    allow_sensitive: bool = False  # when True, the user has pre-authorized side effects

    def check(self, tool: str, args: dict | None = None) -> Decision:
        risk = classify(tool, args)
        if risk is Risk.BLOCKED:
            return Decision(False, risk, f"{tool!r} cannot run inside an autonomous plan.")
        if risk is Risk.SENSITIVE and not self.allow_sensitive:
            return Decision(
                False, risk,
                f"{tool!r} has side effects and needs your confirmation before I run it.",
            )
        return Decision(True, risk, "")
