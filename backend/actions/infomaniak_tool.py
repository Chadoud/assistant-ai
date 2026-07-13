"""
Infomaniak connector — Mail and Calendar via the Infomaniak public API.

Uses the Infomaniak API (https://api.infomaniak.com/1/) with the OAuth access
token stored under provider ID "infomaniak" or "infomaniak-calendar" in
connector_credentials. Both services share the same Infomaniak OAuth session.

The Infomaniak API uses Bearer token authentication. Mail and calendar
operations call the kDrive/kSuite API endpoints.

Operations:
  Mail:     list_mail, search_mail, send_mail
  Calendar: list_calendars, list_events, create_event, update_event, delete_event
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_API_BASE = "https://api.infomaniak.com/1"

_INFOMANIAK_PROVIDER_IDS = ("infomaniak", "infomaniak-calendar")


def _token() -> str:
    return try_get_token(*_INFOMANIAK_PROVIDER_IDS)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


# ── Mail operations ───────────────────────────────────────────────────────────

def _list_mail(params: dict[str, Any]) -> dict[str, Any]:
    """
    List recent Infomaniak mail messages.

    Args:
        mailbox: Mailbox identifier (use "me" for the authenticated user's primary mailbox).
        folder: Mail folder slug (default "INBOX").
        limit: Maximum messages to return (default 20, max 100).
        page: Pagination page (default 1).
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    folder = str(params.get("folder", "INBOX")).strip() or "INBOX"
    limit = min(int(params.get("limit", 20)), 100)
    page = int(params.get("page", 1))

    res = httpx.get(
        f"{_API_BASE}/mail/{mailbox}/folder/{folder}/messages",
        headers=_headers(),
        params={"limit": limit, "page": page},
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    messages = data.get("data", [])
    return {"ok": True, "data": {"messages": messages, "count": len(messages)}}


def _search_mail(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search Infomaniak mail messages.

    Args:
        mailbox: Mailbox identifier (default "me").
        query: Search terms (subject / from / body).
        limit: Maximum results (default 20, max 100).
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    query = str(params.get("query", "")).strip()
    limit = min(int(params.get("limit", 20)), 100)

    if not query:
        return {"ok": False, "error": "query is required"}

    res = httpx.get(
        f"{_API_BASE}/mail/{mailbox}/messages/search",
        headers=_headers(),
        params={"q": query, "limit": limit},
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    messages = data.get("data", [])
    return {"ok": True, "data": {"messages": messages, "count": len(messages)}}


def _send_mail(params: dict[str, Any]) -> dict[str, Any]:
    """
    Send an email via Infomaniak Mail.

    Args:
        mailbox: Mailbox identifier (default "me").
        to: Recipient email address(es), comma-separated.
        subject: Email subject line.
        body: Plain-text email body.
        cc: Optional CC addresses, comma-separated.
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    to = str(params.get("to", "")).strip()
    subject = str(params.get("subject", "")).strip()
    body = str(params.get("body", "")).strip()
    cc = str(params.get("cc", "")).strip()

    if not to or not subject or not body:
        return {"ok": False, "error": "to, subject, and body are required"}

    payload: dict[str, Any] = {
        "to": [{"email": addr.strip()} for addr in to.split(",") if addr.strip()],
        "subject": subject,
        "body": {"text": body},
    }
    if cc:
        payload["cc"] = [{"email": addr.strip()} for addr in cc.split(",") if addr.strip()]

    res = httpx.post(
        f"{_API_BASE}/mail/{mailbox}/messages/send",
        headers=_headers(),
        content=json.dumps(payload),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"sent": True}}


# ── Calendar operations ───────────────────────────────────────────────────────

def _list_calendars(params: dict[str, Any]) -> dict[str, Any]:
    """
    List Infomaniak calendar collections for the authenticated user.

    Args:
        mailbox: Mailbox identifier (default "me").
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"

    res = httpx.get(
        f"{_API_BASE}/calendar/{mailbox}/calendars",
        headers=_headers(),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    calendars = data.get("data", [])
    return {"ok": True, "data": {"calendars": calendars, "count": len(calendars)}}


def _list_events(params: dict[str, Any]) -> dict[str, Any]:
    """
    List Infomaniak Calendar events in a date range.

    Args:
        mailbox: Mailbox identifier (default "me").
        calendar_id: Calendar ID. If omitted, uses the primary calendar.
        start: ISO 8601 range start (default: today).
        end: ISO 8601 range end (default: 7 days from start).
        limit: Maximum events (default 25, max 100).
    """
    from datetime import datetime, timedelta, timezone

    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    calendar_id = str(params.get("calendar_id", "")).strip()
    limit = min(int(params.get("limit", 25)), 100)

    now = datetime.now(timezone.utc)
    start = params.get("start") or now.isoformat()
    end = params.get("end") or (now + timedelta(days=7)).isoformat()

    path = f"{_API_BASE}/calendar/{mailbox}"
    if calendar_id:
        path += f"/{calendar_id}"
    path += "/events"

    res = httpx.get(
        path,
        headers=_headers(),
        params={"start": start, "end": end, "limit": limit},
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    events = data.get("data", [])
    return {"ok": True, "data": {"events": events, "count": len(events)}}


def _create_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new Infomaniak Calendar event.

    Args:
        mailbox: Mailbox identifier (default "me").
        calendar_id: Target calendar ID.
        summary: Event title.
        start: ISO 8601 start datetime.
        end: ISO 8601 end datetime.
        description: Optional event description.
        location: Optional location.
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    calendar_id = str(params.get("calendar_id", "")).strip()
    summary = str(params.get("summary", "")).strip()
    start = str(params.get("start", "")).strip()
    end = str(params.get("end", "")).strip()

    if not summary or not start or not end:
        return {"ok": False, "error": "summary, start, and end are required"}

    event: dict[str, Any] = {"summary": summary, "dtstart": start, "dtend": end}
    if params.get("description"):
        event["description"] = str(params["description"])
    if params.get("location"):
        event["location"] = str(params["location"])

    path = f"{_API_BASE}/calendar/{mailbox}"
    if calendar_id:
        path += f"/{calendar_id}"
    path += "/events"

    res = httpx.post(path, headers=_headers(), content=json.dumps(event), timeout=15)
    res.raise_for_status()
    data = res.json()
    return {"ok": True, "data": data.get("data", {})}


def _update_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Update an existing Infomaniak Calendar event.

    Args:
        mailbox: Mailbox identifier (default "me").
        calendar_id: Calendar ID.
        event_id: Event ID to update.
        summary: New title (optional).
        start: New start (optional).
        end: New end (optional).
        description: New description (optional).
        location: New location (optional).
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    calendar_id = str(params.get("calendar_id", "")).strip()
    event_id = str(params.get("event_id", "")).strip()

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    patch: dict[str, Any] = {}
    for field in ("summary", "start", "end", "description", "location"):
        if params.get(field):
            key = "dtstart" if field == "start" else ("dtend" if field == "end" else field)
            patch[key] = str(params[field])

    if not patch:
        return {"ok": False, "error": "At least one field to update is required"}

    path = f"{_API_BASE}/calendar/{mailbox}"
    if calendar_id:
        path += f"/{calendar_id}"
    path += f"/events/{event_id}"

    res = httpx.put(path, headers=_headers(), content=json.dumps(patch), timeout=15)
    res.raise_for_status()
    return {"ok": True, "data": {"event_id": event_id}}


def _delete_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Delete an Infomaniak Calendar event.

    Args:
        mailbox: Mailbox identifier (default "me").
        calendar_id: Calendar ID.
        event_id: Event ID to delete.
    """
    mailbox = str(params.get("mailbox", "me")).strip() or "me"
    calendar_id = str(params.get("calendar_id", "")).strip()
    event_id = str(params.get("event_id", "")).strip()

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    path = f"{_API_BASE}/calendar/{mailbox}"
    if calendar_id:
        path += f"/{calendar_id}"
    path += f"/events/{event_id}"

    res = httpx.delete(path, headers=_headers(), timeout=10)
    res.raise_for_status()
    return {"ok": True, "data": {"deleted_event_id": event_id}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    # Mail
    "list_mail": _list_mail,
    "search_mail": _search_mail,
    "send_mail": _send_mail,
    # Calendar
    "list_calendars": _list_calendars,
    "list_events": _list_events,
    "create_event": _create_event,
    "update_event": _update_event,
    "delete_event": _delete_event,
}


def infomaniak_services(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Infomaniak connector — Mail and Calendar.

    Parameters:
        operation: One of list_mail | search_mail | send_mail |
                   list_calendars | list_events | create_event |
                   update_event | delete_event
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] infomaniak_services called args=%r", parameters)
    operation = str(parameters.get("operation", "")).strip()

    if not operation:
        return {
            "ok": False,
            "error": f"operation is required. Available: {sorted(_OPERATIONS)}",
        }

    handler = _OPERATIONS.get(operation)
    if handler is None:
        return {
            "ok": False,
            "error": f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}",
        }

    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        logger.warning("[infomaniak_services] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning("[infomaniak_services] HTTP %s for %s", exc.response.status_code, exc.request.url)
        return {"ok": False, "error": f"Infomaniak API error {exc.response.status_code}: {exc.response.text[:300]}"}
    except Exception as exc:
        logger.exception("[infomaniak_services] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
