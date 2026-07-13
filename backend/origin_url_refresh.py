"""
Refresh cached provider URLs for memory/task open targets.
"""

from __future__ import annotations

import logging

from origin_refs import (
    build_google_calendar_event_url,
    build_url_from_external_ref,
    is_valid_google_calendar_open_url,
    parse_external_id,
)

logger = logging.getLogger(__name__)


def refresh_origin_url(origin_ref: str, *, cached_url: str | None = None) -> str | None:
    """
    Re-fetch provider link when missing or when refresh is cheap.

    Returns a usable https URL or None.
    """
    parsed = parse_external_id(origin_ref)
    if not parsed:
        return cached_url

    if parsed.source == "google-calendar" and parsed.kind == "cal":
        if cached_url and is_valid_google_calendar_open_url(
            cached_url,
            expected_event_id=parsed.item_id,
        ):
            return cached_url
        url = _refresh_google_calendar_link(parsed.item_id)
        if url and is_valid_google_calendar_open_url(url, expected_event_id=parsed.item_id):
            return url
        return build_google_calendar_event_url(parsed.item_id)

    if parsed.source == "gmail" and parsed.kind == "mail":
        return cached_url or _build_gmail_url(parsed.item_id)

    if parsed.source == "outlook-calendar" and parsed.kind == "cal":
        url = _refresh_outlook_calendar_link(parsed.item_id)
        return url or cached_url

    if parsed.source == "outlook" and parsed.kind == "mail":
        return cached_url or _build_outlook_mail_url(parsed.item_id)

    return cached_url


def _build_gmail_url(message_id: str) -> str:

    return build_url_from_external_ref(f"gmail:mail:{message_id}") or ""


def _build_outlook_mail_url(message_id: str) -> str:

    return build_url_from_external_ref(f"outlook:mail:{message_id}") or ""


def _refresh_google_calendar_link(event_id: str, *, calendar_id: str = "primary") -> str | None:
    try:
        from actions.google_workspace_tool import _calendar_fetch_event_html_link

        return _calendar_fetch_event_html_link(event_id, calendar_id=calendar_id)
    except Exception:
        logger.debug("google calendar refresh failed", exc_info=True)
    return None


def _refresh_outlook_calendar_link(event_id: str) -> str | None:
    try:
        from datetime import datetime, timedelta, timezone

        from actions.microsoft_graph_tool import _calendar_list_events

        now = datetime.now(timezone.utc)
        result = _calendar_list_events(
            {
                "start_datetime": now.isoformat(),
                "end_datetime": (now + timedelta(days=30)).isoformat(),
                "max_results": 50,
            }
        )
        if not result.get("ok"):
            return None
        for ev in (result.get("data") or {}).get("events") or []:
            if str(ev.get("id") or "") == event_id:
                link = str(ev.get("web_link") or "").strip()
                return link or None
    except Exception:
        logger.debug("outlook calendar refresh failed", exc_info=True)
    return None
