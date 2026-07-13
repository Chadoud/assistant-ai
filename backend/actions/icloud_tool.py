"""
iCloud connector — limited read access to iCloud Drive via Apple's private
CloudKit web service API.

Apple does not provide a public REST API for iCloud Drive file management.
This module uses the semi-documented iCloud web API (the same endpoint the
iCloud.com web app uses) with an authenticated session cookie. Authentication
requires App-Specific Passwords and is Apple-ID bound.

The connector stores authentication state under provider ID "icloud" in
connector_credentials. The token blob should be JSON:
  {"apple_id": "...", "session_token": "...", "cookies": {...}}

Supported operations (read-only in this version due to API limitations):
  list_files, get_metadata

Write operations (move, copy, delete) are not supported: Apple's private API
is reverse-engineered, unstable, and subject to change without notice. Use
iCloud Drive via the desktop Finder/File Explorer integration for writes.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError

logger = logging.getLogger(__name__)

_ICLOUD_AUTH_ENDPOINT = "https://setup.icloud.com/setup/ws/1"
_ICLOUD_DRIVE_ENDPOINT = "https://p68-drivews.icloud.com"


def _load_icloud_session() -> dict[str, Any]:
    """
    Load iCloud session data from the credential cache.

    Returns a dict with keys: apple_id, session_token, cookies (dict).
    Raises CredentialUnavailableError if the session is not available.
    """
    import time

    from connector_credentials import _ENV_PREFIX, _token_cache

    entry = _token_cache.get("icloud")
    if entry and (entry.expires_at == 0.0 or time.monotonic() < entry.expires_at):
        try:
            return json.loads(entry.token)
        except json.JSONDecodeError:
            pass

    env_val = os.environ.get(f"{_ENV_PREFIX}ICLOUD", "").strip()
    if env_val:
        try:
            return json.loads(env_val)
        except json.JSONDecodeError:
            pass

    raise CredentialUnavailableError(
        "No iCloud session available. Connect your iCloud account in Settings → "
        "External Sources using an App-Specific Password."
    )


def _icloud_headers(session: dict[str, Any]) -> dict[str, str]:
    return {
        "Origin": "https://www.icloud.com",
        "Referer": "https://www.icloud.com/",
        "User-Agent": "Mozilla/5.0 AI-Manager/1.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


# ── Operations ────────────────────────────────────────────────────────────────

def _list_files(params: dict[str, Any]) -> dict[str, Any]:
    """
    List files and folders in an iCloud Drive folder.

    Note: This uses Apple's private API. Behaviour may vary across Apple ID regions.

    Args:
        folder_id: Drive item drivewsid (default "FOLDER::com.apple.CloudDocs::root").
        limit: Maximum items to return (default 50).
    """
    session = _load_icloud_session()
    cookies = session.get("cookies", {})
    session_token = session.get("session_token", "")
    limit = min(int(params.get("limit", 50)), 200)
    folder_id = str(params.get("folder_id", "FOLDER::com.apple.CloudDocs::root")).strip()

    params_body = {
        "drivewsid": folder_id,
        "partialData": False,
        "limit": limit,
    }

    with httpx.Client(cookies=cookies, timeout=15) as client:
        res = client.post(
            f"{_ICLOUD_DRIVE_ENDPOINT}/ws/com.apple.CloudDocs/list/lookup",
            headers=_icloud_headers(session),
            params={"dsid": session_token},
            content=json.dumps([params_body]),
        )

    if res.status_code == 421:
        # Region-redirected — return informative error with the redirect hint
        return {
            "ok": False,
            "error": (
                "iCloud returned a region redirect (421). "
                "Reconnect your iCloud account in Settings to refresh the session endpoint."
            ),
        }
    res.raise_for_status()

    data = res.json()
    items_raw = data[0].get("items", []) if isinstance(data, list) else data.get("items", [])
    items = [
        {
            "drivewsid": i.get("drivewsid"),
            "docwsid": i.get("docwsid"),
            "name": i.get("name"),
            "type": "folder" if i.get("type") == "FOLDER" else "file",
            "size": i.get("size"),
            "modified": i.get("dateModified"),
        }
        for i in items_raw
    ]
    return {"ok": True, "data": {"items": items, "count": len(items)}}


def _get_metadata(params: dict[str, Any]) -> dict[str, Any]:
    """
    Get metadata for a specific iCloud Drive item.

    Args:
        drivewsid: iCloud Drive item identifier.
    """
    session = _load_icloud_session()
    cookies = session.get("cookies", {})
    session_token = session.get("session_token", "")
    drivewsid = str(params.get("drivewsid", "")).strip()

    if not drivewsid:
        return {"ok": False, "error": "drivewsid is required"}

    with httpx.Client(cookies=cookies, timeout=10) as client:
        res = client.post(
            f"{_ICLOUD_DRIVE_ENDPOINT}/ws/com.apple.CloudDocs/list/lookup",
            headers=_icloud_headers(session),
            params={"dsid": session_token},
            content=json.dumps([{"drivewsid": drivewsid, "partialData": False}]),
        )

    res.raise_for_status()
    data = res.json()
    item = data[0] if isinstance(data, list) else data
    return {"ok": True, "data": item}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    "list_files": _list_files,
    "get_metadata": _get_metadata,
}


def icloud_drive(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    iCloud Drive connector — read-only file listing.

    Write operations (move, copy, delete) are not supported via API;
    Apple does not expose a stable public REST API for iCloud Drive mutations.

    Parameters:
        operation: One of list_files | get_metadata
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] icloud_drive called args=%r", parameters)
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
            "error": (
                f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}. "
                "Note: iCloud Drive write operations (move/copy/delete) are not supported "
                "via API — use the desktop Finder integration instead."
            ),
        }

    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        logger.warning("[icloud_drive] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning("[icloud_drive] HTTP %s for %s", exc.response.status_code, exc.request.url)
        return {"ok": False, "error": f"iCloud API error {exc.response.status_code}: {exc.response.text[:300]}"}
    except Exception as exc:
        logger.exception("[icloud_drive] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
