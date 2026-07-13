"""Resolve which integration tool owns calendar read/write for this session."""

from __future__ import annotations

from connector_credentials import list_connected_providers

_CALENDAR_TOOL_NAMES = frozenset({"google_workspace", "microsoft_graph", "infomaniak_services"})
_GOOGLE_CALENDAR_PROVIDER_IDS = frozenset({"google-calendar", "google", "google-all"})
_MICROSOFT_CALENDAR_PROVIDER_IDS = frozenset({"microsoft", "outlook", "onedrive"})


def resolve_calendar_tool_name(preferred: str | None = None) -> str:
    """
    Pick the calendar integration tool from a connected account.

    Prefers an explicit tool name when valid; otherwise uses relayed tokens
    (Microsoft when only Microsoft is connected, else Google).
    """
    if preferred and preferred.strip() in _CALENDAR_TOOL_NAMES:
        return preferred.strip()

    connected = set(list_connected_providers())
    has_google = bool(connected & _GOOGLE_CALENDAR_PROVIDER_IDS)
    has_microsoft = bool(connected & _MICROSOFT_CALENDAR_PROVIDER_IDS)

    if has_microsoft and not has_google:
        return "microsoft_graph"
    return "google_workspace"
