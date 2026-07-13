"""Wide, paginated calendar list parameters for delete discovery."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# Google Calendar events.list allows up to 2500 per page; cap total for latency.
DELETE_LIST_PAST_DAYS = 365
DELETE_LIST_FUTURE_DAYS = 730
DELETE_LIST_MAX_EVENTS = 500
DELETE_PAGE_SIZE = 250


def delete_list_window() -> tuple[str, str]:
    """Return ISO bounds that cover past and future recurring instances."""
    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=DELETE_LIST_PAST_DAYS)).isoformat()
    time_max = (now + timedelta(days=DELETE_LIST_FUTURE_DAYS)).isoformat()
    return time_min, time_max


def build_delete_list_params(
    *,
    needle: str | None = None,
    calendar_id: str = "primary",
    fetch_all: bool = True,
) -> dict[str, Any]:
    """
    Build list_calendar_events args for delete discovery.

    Uses Google Calendar ``q`` free-text search when a needle is present, paginates
    until ``max_total`` or no ``nextPageToken``, and expands recurring instances.
    """
    time_min, time_max = delete_list_window()
    params: dict[str, Any] = {
        "operation": "list_calendar_events",
        "calendar_id": calendar_id,
        "time_min": time_min,
        "time_max": time_max,
        "max_results": DELETE_PAGE_SIZE,
        "fetch_all": fetch_all,
        "max_total": DELETE_LIST_MAX_EVENTS,
        "single_events": True,
    }
    cleaned = (needle or "").strip()
    if cleaned:
        params["q"] = cleaned
    return params
