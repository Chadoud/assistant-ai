"""
Microsoft Graph connector — Outlook Mail, OneDrive Files, and Outlook Calendar.

All operations use a Microsoft Graph OAuth access token stored in
connector_credentials under the provider IDs "microsoft", "onedrive", or "outlook".
The same token covers all three services when the correct Graph scopes were
requested during the OAuth connect flow.

Operations:
  Mail:     search_mail, send_mail, list_folders, move_mail
  OneDrive: list_files, search_files, move_file, create_folder, get_file_metadata
  Calendar: list_events, create_event, update_event, delete_event
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_GRAPH_BASE = "https://graph.microsoft.com/v1.0/me"

# Microsoft tokens are shared across services under different provider IDs.
_MS_PROVIDER_IDS = ("microsoft", "onedrive", "outlook")


def _token() -> str:
    return try_get_token(*_MS_PROVIDER_IDS)


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json",
    }


# ── Outlook Mail ──────────────────────────────────────────────────────────────

def _mail_search(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search Outlook mail messages via Microsoft Graph.

    Args:
        query: OData $search or $filter query string.
        max_results: Maximum messages to return (default 20, max 50).
        folder: Mail folder name to search in (default "inbox").
    """
    query = str(params.get("query", "")).strip()
    max_results = min(int(params.get("max_results", 20)), 50)
    folder = str(params.get("folder", "inbox")).strip() or "inbox"

    url = f"{_GRAPH_BASE}/mailFolders/{folder}/messages"
    query_params: dict[str, Any] = {
        "$top": max_results,
        "$select": "id,subject,from,receivedDateTime,bodyPreview,importance,flag,isRead",
    }
    if query:
        # $orderby is incompatible with $search in Microsoft Graph API
        query_params["$search"] = f'"{query}"'
    else:
        query_params["$orderby"] = "receivedDateTime desc"

    res = httpx.get(url, headers=_headers(), params=query_params, timeout=15)
    res.raise_for_status()

    messages = [
        {
            "id": m.get("id"),
            "subject": m.get("subject", "(no subject)"),
            "from": m.get("from", {}).get("emailAddress", {}).get("address", ""),
            "received": m.get("receivedDateTime", ""),
            "preview": m.get("bodyPreview", ""),
            "importance": m.get("importance", "normal"),
            "is_flagged": bool(m.get("flag", {}).get("flagStatus") == "flagged"),
            "inference_classification": m.get("inferenceClassification"),
        }
        for m in res.json().get("value", [])
    ]
    return {"ok": True, "data": {"messages": messages, "count": len(messages)}}


# Recipient aliases that mean "send it to the account owner" — resolved to the
# authenticated user's own address so the assistant never has to ask for it.
_SELF_RECIPIENT_ALIASES = frozenset({
    "me", "myself", "self", "my email", "my e-mail", "my address", "my mail",
    "moi", "moi-même", "mon email", "mon e-mail", "mon adresse", "mon mail",
    "mich", "ich", "mir", "mi", "io", "me stesso",
})


def _graph_self_email() -> str:
    """Return the authenticated user's own Outlook address via the /me profile."""
    res = httpx.get(_GRAPH_BASE, headers=_headers(), timeout=10)
    res.raise_for_status()
    profile = res.json()
    return str(profile.get("mail") or profile.get("userPrincipalName") or "").strip()


def _derive_subject_from_body(body: str) -> str:
    """Make a short, sensible subject from the body when none was provided."""
    first_line = body.strip().splitlines()[0] if body.strip() else ""
    words = first_line.split()
    if not words:
        return "(no subject)"
    snippet = " ".join(words[:8])
    if len(snippet) > 60:
        snippet = snippet[:59].rstrip() + "…"
    return snippet[0].upper() + snippet[1:] if snippet else "(no subject)"


def _mail_send(params: dict[str, Any]) -> dict[str, Any]:
    """
    Send an email via Outlook / Microsoft Graph.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text or HTML email body.
        cc: Optional CC address(es), comma-separated.
        is_html: Set True when body contains HTML (default False).
    """
    to = str(params.get("to", "")).strip()
    subject = str(params.get("subject", "")).strip()
    body = str(params.get("body", "")).strip()
    cc_raw = str(params.get("cc", "")).strip()
    is_html = bool(params.get("is_html", False))

    # "send me ..." / empty recipient → the user's own mailbox, no need to ask.
    if not to or to.lower() in _SELF_RECIPIENT_ALIASES:
        try:
            to = _graph_self_email()
        except Exception as exc:
            return {"ok": False, "error": f"Could not resolve your own email address: {exc}"}
        if not to:
            return {"ok": False, "error": "Could not determine your own Outlook address."}

    if not body:
        return {"ok": False, "error": "body is required"}

    if not subject:
        subject = _derive_subject_from_body(body)

    to_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in to.split(",")
        if addr.strip()
    ]
    cc_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in cc_raw.split(",")
        if addr.strip()
    ]

    message: dict[str, Any] = {
        "subject": subject,
        "body": {"contentType": "HTML" if is_html else "Text", "content": body},
        "toRecipients": to_recipients,
    }
    if cc_recipients:
        message["ccRecipients"] = cc_recipients

    res = httpx.post(
        f"{_GRAPH_BASE}/sendMail",
        headers=_headers(),
        content=json.dumps({"message": message, "saveToSentItems": True}),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"sent": True}}


def _mail_list_folders(_params: dict[str, Any]) -> dict[str, Any]:
    """List Outlook mail folders."""
    res = httpx.get(f"{_GRAPH_BASE}/mailFolders", headers=_headers(), timeout=10)
    res.raise_for_status()
    folders = [{"id": f["id"], "name": f["displayName"], "count": f.get("totalItemCount", 0)}
               for f in res.json().get("value", [])]
    return {"ok": True, "data": {"folders": folders}}


def _mail_move(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move an Outlook message to a different folder.

    Args:
        message_id: Graph message ID.
        destination_folder_id: Target folder ID.
    """
    message_id = str(params.get("message_id", "")).strip()
    destination = str(params.get("destination_folder_id", "")).strip()

    if not message_id or not destination:
        return {"ok": False, "error": "message_id and destination_folder_id are required"}

    res = httpx.post(
        f"{_GRAPH_BASE}/messages/{message_id}/move",
        headers=_headers(),
        content=json.dumps({"destinationId": destination}),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"moved_message_id": message_id}}


# ── OneDrive ──────────────────────────────────────────────────────────────────

def _onedrive_list(params: dict[str, Any]) -> dict[str, Any]:
    """
    List items in a OneDrive folder.

    Args:
        folder_path: Drive path, e.g. "/Documents". Defaults to root.
        page_size: Number of items to return (default 30, max 100).
    """
    folder_path = str(params.get("folder_path", "")).strip()
    page_size = min(int(params.get("page_size", 30)), 100)

    if folder_path and folder_path != "/":
        url = f"{_GRAPH_BASE}/drive/root:{folder_path}:/children"
    else:
        url = f"{_GRAPH_BASE}/drive/root/children"

    res = httpx.get(
        url,
        headers=_headers(),
        params={
            "$top": page_size,
            "$select": "id,name,size,lastModifiedDateTime,file,folder,parentReference",
        },
        timeout=15,
    )
    res.raise_for_status()
    items = res.json().get("value", [])
    return {"ok": True, "data": {"items": items, "count": len(items)}}


def _onedrive_search(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search OneDrive for files and folders.

    Args:
        query: Search terms.
        max_results: Maximum results (default 20, max 50).
    """
    query = str(params.get("query", "")).strip()
    max_results = min(int(params.get("max_results", 20)), 50)

    if not query:
        return {"ok": False, "error": "query is required"}

    res = httpx.get(
        f"{_GRAPH_BASE}/drive/root/search(q='{query}')",
        headers=_headers(),
        params={"$top": max_results, "$select": "id,name,size,lastModifiedDateTime,file,folder"},
        timeout=15,
    )
    res.raise_for_status()
    items = res.json().get("value", [])
    return {"ok": True, "data": {"items": items, "count": len(items)}}


def _onedrive_move(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move a OneDrive item to a different folder.

    Args:
        item_id: OneDrive item ID.
        destination_folder_id: ID of the destination folder.
        new_name: Optional new name for the item after moving.
    """
    item_id = str(params.get("item_id", "")).strip()
    dest_folder = str(params.get("destination_folder_id", "")).strip()
    new_name = str(params.get("new_name", "")).strip()

    if not item_id or not dest_folder:
        return {"ok": False, "error": "item_id and destination_folder_id are required"}

    patch: dict[str, Any] = {"parentReference": {"id": dest_folder}}
    if new_name:
        patch["name"] = new_name

    res = httpx.patch(
        f"{_GRAPH_BASE}/drive/items/{item_id}",
        headers=_headers(),
        content=json.dumps(patch),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"item_id": item_id, "new_folder": dest_folder}}


def _onedrive_create_folder(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new folder in OneDrive.

    Args:
        name: Folder name.
        parent_path: Parent path, e.g. "/Documents". Defaults to root.
    """
    name = str(params.get("name", "")).strip()
    parent_path = str(params.get("parent_path", "")).strip()

    if not name:
        return {"ok": False, "error": "name is required"}

    if parent_path and parent_path != "/":
        url = f"{_GRAPH_BASE}/drive/root:{parent_path}:/children"
    else:
        url = f"{_GRAPH_BASE}/drive/root/children"

    res = httpx.post(
        url,
        headers=_headers(),
        content=json.dumps({
            "name": name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "rename",
        }),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    return {"ok": True, "data": {"folder_id": data.get("id"), "name": data.get("name")}}


def _onedrive_get_metadata(params: dict[str, Any]) -> dict[str, Any]:
    """
    Get metadata for a single OneDrive item.

    Args:
        item_id: OneDrive item ID.
    """
    item_id = str(params.get("item_id", "")).strip()
    if not item_id:
        return {"ok": False, "error": "item_id is required"}

    res = httpx.get(
        f"{_GRAPH_BASE}/drive/items/{item_id}",
        headers=_headers(),
        params={"$select": "id,name,size,lastModifiedDateTime,file,folder,webUrl"},
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": res.json()}


# ── Outlook Calendar ──────────────────────────────────────────────────────────

def _calendar_list_events(params: dict[str, Any]) -> dict[str, Any]:
    """
    List Outlook Calendar events.

    Args:
        start_datetime: ISO 8601 start bound (default: now).
        end_datetime: ISO 8601 end bound.
        max_results: Maximum events to return (default 25, max 100).
        calendar_id: Calendar ID (default "calendar" = primary).
    """
    from datetime import datetime, timezone

    start = (
        params.get("start_datetime")
        or params.get("time_min")
        or params.get("start")
        or datetime.now(timezone.utc).isoformat()
    )
    end = params.get("end_datetime") or params.get("time_max") or params.get("end")
    max_results = min(int(params.get("max_results", 25)), 100)
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"

    query_params: dict[str, Any] = {
        "$top": max_results,
        "$select": "id,subject,start,end,location,bodyPreview,organizer,webLink",
        "$orderby": "start/dateTime",
        "startDateTime": start,
    }
    if end:
        query_params["endDateTime"] = end

    res = httpx.get(
        f"{_GRAPH_BASE}/{calendar_id}/calendarView",
        headers=_headers(),
        params=query_params,
        timeout=15,
    )
    res.raise_for_status()

    events = [
        {
            "id": e.get("id"),
            "summary": e.get("subject", "(no title)"),
            "subject": e.get("subject", "(no title)"),
            "start": e.get("start", {}).get("dateTime"),
            "end": e.get("end", {}).get("dateTime"),
            "location": e.get("location", {}).get("displayName"),
            "preview": e.get("bodyPreview", ""),
            "organizer": e.get("organizer", {}).get("emailAddress", {}).get("name", ""),
            "web_link": e.get("webLink") or "",
            "recurring_event_id": e.get("seriesMasterId"),
            "is_recurring_instance": e.get("type") == "occurrence",
            "event_type": e.get("type"),
        }
        for e in res.json().get("value", [])
    ]
    return {"ok": True, "data": {"events": events, "count": len(events)}}


def _calendar_create_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new Outlook Calendar event.

    Args:
        subject: Event title.
        start: ISO 8601 start datetime.
        end: ISO 8601 end datetime.
        timezone: IANA timezone name (default "UTC").
        body: Optional event description (HTML).
        location: Optional location string.
        attendees: Optional list of attendee email addresses.
        calendar_id: Calendar ID (default "calendar").
    """
    subject = str(params.get("subject", "")).strip()
    start = str(params.get("start", "")).strip()
    end = str(params.get("end", "")).strip()
    tz = str(params.get("timezone", "UTC")).strip() or "UTC"
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"

    if not subject or not start or not end:
        return {"ok": False, "error": "subject, start, and end are required"}

    event: dict[str, Any] = {
        "subject": subject,
        "start": {"dateTime": start, "timeZone": tz},
        "end": {"dateTime": end, "timeZone": tz},
    }
    if params.get("body"):
        event["body"] = {"contentType": "HTML", "content": str(params["body"])}
    if params.get("location"):
        event["location"] = {"displayName": str(params["location"])}
    if params.get("attendees"):
        event["attendees"] = [
            {"emailAddress": {"address": e}, "type": "required"}
            for e in params["attendees"]
            if isinstance(e, str)
        ]

    res = httpx.post(
        f"{_GRAPH_BASE}/{calendar_id}/events",
        headers=_headers(),
        content=json.dumps(event),
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    return {"ok": True, "data": {"event_id": data.get("id"), "web_link": data.get("webLink")}}


def _calendar_update_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Update an existing Outlook Calendar event.

    Args:
        event_id: Graph event ID.
        calendar_id: Calendar ID (default "calendar").
        subject: New title (optional).
        start: New ISO 8601 start datetime (optional).
        end: New ISO 8601 end datetime (optional).
        timezone: IANA timezone (optional).
        location: New location (optional).
        body: New body HTML (optional).
    """
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"
    tz = str(params.get("timezone", "UTC")).strip() or "UTC"

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    patch: dict[str, Any] = {}
    if params.get("subject"):
        patch["subject"] = str(params["subject"])
    if params.get("start"):
        patch["start"] = {"dateTime": str(params["start"]), "timeZone": tz}
    if params.get("end"):
        patch["end"] = {"dateTime": str(params["end"]), "timeZone": tz}
    if params.get("location"):
        patch["location"] = {"displayName": str(params["location"])}
    if params.get("body"):
        patch["body"] = {"contentType": "HTML", "content": str(params["body"])}

    if not patch:
        return {"ok": False, "error": "At least one field to update is required"}

    res = httpx.patch(
        f"{_GRAPH_BASE}/{calendar_id}/events/{event_id}",
        headers=_headers(),
        content=json.dumps(patch),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"event_id": event_id}}


def _calendar_delete_event(params: dict[str, Any]) -> dict[str, Any]:
    """
    Delete an Outlook Calendar event.

    Args:
        event_id: Graph event ID.
        calendar_id: Calendar ID (default "calendar").
    """
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"

    if not event_id:
        return {"ok": False, "error": "event_id is required"}

    res = httpx.delete(
        f"{_GRAPH_BASE}/{calendar_id}/events/{event_id}",
        headers=_headers(),
        timeout=10,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"deleted_event_id": event_id}}


def _calendar_get_event(params: dict[str, Any]) -> dict[str, Any]:
    """Fetch one Outlook event."""
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"
    if not event_id:
        return {"ok": False, "error": "event_id is required"}
    res = httpx.get(
        f"{_GRAPH_BASE}/{calendar_id}/events/{event_id}",
        headers=_headers(),
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    return {
        "ok": True,
        "data": {
            "id": data.get("id"),
            "recurrence": data.get("recurrence"),
            "series_master_id": data.get("seriesMasterId"),
        },
    }


def _calendar_patch_recurrence_end(params: dict[str, Any]) -> dict[str, Any]:
    """End a recurring series before a date (this and following)."""
    event_id = str(params.get("event_id", "")).strip()
    calendar_id = str(params.get("calendar_id", "calendar")).strip() or "calendar"
    end_date = str(params.get("end_date", "")).strip()
    if not event_id or not end_date:
        return {"ok": False, "error": "event_id and end_date are required"}

    get_res = httpx.get(
        f"{_GRAPH_BASE}/{calendar_id}/events/{event_id}",
        headers=_headers(),
        timeout=10,
    )
    get_res.raise_for_status()
    master = get_res.json()
    recurrence = master.get("recurrence") if isinstance(master.get("recurrence"), dict) else {}
    if not recurrence:
        return {"ok": False, "error": "Event is not a recurring series"}

    range_block = recurrence.get("range") if isinstance(recurrence.get("range"), dict) else {}
    range_block["type"] = "endDate"
    range_block["endDate"] = end_date
    recurrence["range"] = range_block

    res = httpx.patch(
        f"{_GRAPH_BASE}/{calendar_id}/events/{event_id}",
        headers=_headers(),
        content=json.dumps({"recurrence": recurrence}),
        timeout=15,
    )
    res.raise_for_status()
    return {"ok": True, "data": {"event_id": event_id}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    # Mail
    "search_mail": _mail_search,
    "send_mail": _mail_send,
    "list_mail_folders": _mail_list_folders,
    "move_mail": _mail_move,
    # OneDrive
    "list_onedrive_files": _onedrive_list,
    "search_onedrive": _onedrive_search,
    "move_onedrive_file": _onedrive_move,
    "create_onedrive_folder": _onedrive_create_folder,
    "get_onedrive_metadata": _onedrive_get_metadata,
    # Calendar
    "list_calendar_events": _calendar_list_events,
    "create_calendar_event": _calendar_create_event,
    "update_calendar_event": _calendar_update_event,
    "delete_calendar_event": _calendar_delete_event,
    "get_calendar_event": _calendar_get_event,
    "patch_calendar_recurrence_end": _calendar_patch_recurrence_end,
}


def microsoft_graph(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Microsoft Graph connector — Outlook Mail, OneDrive, and Outlook Calendar.

    Parameters:
        operation: One of search_mail | send_mail | list_mail_folders | move_mail |
                   list_onedrive_files | search_onedrive | move_onedrive_file |
                   create_onedrive_folder | get_onedrive_metadata |
                   list_calendar_events | create_calendar_event |
                   update_calendar_event | delete_calendar_event
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] microsoft_graph called args=%r", parameters)
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
        logger.warning("[microsoft_graph] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "[microsoft_graph] HTTP %s for %s",
            exc.response.status_code,
            exc.request.url,
        )
        snippet = exc.response.text[:300]
        return {
            "ok": False,
            "error": f"Microsoft Graph error {exc.response.status_code}: {snippet}",
        }
    except Exception as exc:
        logger.exception("[microsoft_graph] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
