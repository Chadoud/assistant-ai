"""
Dropbox connector — list, search, move, copy, and delete files and folders.

Uses the Dropbox API v2 via httpx with the OAuth access token stored under
provider ID "dropbox" in connector_credentials.

Operations:
  list_files, search_files, move_file, copy_file, delete_file,
  create_folder, get_metadata
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_API_BASE = "https://api.dropboxapi.com/2"
_CONTENT_BASE = "https://content.dropboxapi.com/2"


def _token() -> str:
    return try_get_token("dropbox")


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    h = {"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def _post(endpoint: str, body: dict[str, Any]) -> httpx.Response:
    return httpx.post(
        f"{_API_BASE}/{endpoint}",
        headers=_headers(),
        content=json.dumps(body),
        timeout=15,
    )


# ── Operations ────────────────────────────────────────────────────────────────

def _list_files(params: dict[str, Any]) -> dict[str, Any]:
    """
    List files and folders in a Dropbox path.

    Args:
        path: Dropbox path (e.g. "/Documents"). Empty string or "/" for root.
        recursive: If True, list subdirectories recursively (default False).
        limit: Maximum items to return (default 100, max 2000).
    """
    path = str(params.get("path", "")).strip()
    recursive = bool(params.get("recursive", False))
    limit = min(int(params.get("limit", 100)), 2000)

    # Dropbox uses "" for root (not "/")
    normalized = "" if path in ("", "/") else path

    res = _post("files/list_folder", {
        "path": normalized,
        "recursive": recursive,
        "limit": limit,
        "include_media_info": False,
    })
    res.raise_for_status()
    data = res.json()
    entries = [
        {
            "tag": e.get(".tag"),
            "name": e.get("name"),
            "path": e.get("path_display"),
            "size": e.get("size"),
            "modified": e.get("server_modified"),
        }
        for e in data.get("entries", [])
    ]
    return {"ok": True, "data": {"entries": entries, "count": len(entries), "has_more": data.get("has_more", False)}}


def _search_files(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search Dropbox for files by name or content.

    Args:
        query: Search terms.
        path: Restrict search to this path (optional).
        max_results: Maximum results (default 20, max 100).
    """
    query = str(params.get("query", "")).strip()
    path = str(params.get("path", "")).strip()
    max_results = min(int(params.get("max_results", 20)), 100)

    if not query:
        return {"ok": False, "error": "query is required"}

    body: dict[str, Any] = {
        "query": query,
        "options": {"max_results": max_results},
    }
    if path:
        body["options"]["path"] = path

    res = _post("files/search_v2", body)
    res.raise_for_status()
    matches = res.json().get("matches", [])
    results = [
        {
            "tag": m.get("metadata", {}).get("metadata", {}).get(".tag"),
            "name": m.get("metadata", {}).get("metadata", {}).get("name"),
            "path": m.get("metadata", {}).get("metadata", {}).get("path_display"),
            "size": m.get("metadata", {}).get("metadata", {}).get("size"),
        }
        for m in matches
    ]
    return {"ok": True, "data": {"results": results, "count": len(results)}}


def _move_file(params: dict[str, Any]) -> dict[str, Any]:
    """
    Move or rename a Dropbox file or folder.

    Args:
        from_path: Source Dropbox path.
        to_path: Destination Dropbox path.
        allow_shared_folder: Allow moving a shared folder (default False).
    """
    from_path = str(params.get("from_path", "")).strip()
    to_path = str(params.get("to_path", "")).strip()

    if not from_path or not to_path:
        return {"ok": False, "error": "from_path and to_path are required"}

    res = _post("files/move_v2", {
        "from_path": from_path,
        "to_path": to_path,
        "allow_shared_folder": bool(params.get("allow_shared_folder", False)),
        "autorename": True,
    })
    res.raise_for_status()
    metadata = res.json().get("metadata", {})
    return {"ok": True, "data": {"path": metadata.get("path_display"), "name": metadata.get("name")}}


def _copy_file(params: dict[str, Any]) -> dict[str, Any]:
    """
    Copy a Dropbox file or folder.

    Args:
        from_path: Source Dropbox path.
        to_path: Destination Dropbox path.
    """
    from_path = str(params.get("from_path", "")).strip()
    to_path = str(params.get("to_path", "")).strip()

    if not from_path or not to_path:
        return {"ok": False, "error": "from_path and to_path are required"}

    res = _post("files/copy_v2", {
        "from_path": from_path,
        "to_path": to_path,
        "autorename": True,
    })
    res.raise_for_status()
    metadata = res.json().get("metadata", {})
    return {"ok": True, "data": {"path": metadata.get("path_display"), "name": metadata.get("name")}}


def _delete_file(params: dict[str, Any]) -> dict[str, Any]:
    """
    Permanently delete a Dropbox file or folder.

    Args:
        path: Dropbox path to delete.
    """
    path = str(params.get("path", "")).strip()
    if not path:
        return {"ok": False, "error": "path is required"}

    res = _post("files/delete_v2", {"path": path})
    res.raise_for_status()
    metadata = res.json().get("metadata", {})
    return {"ok": True, "data": {"deleted_path": metadata.get("path_display", path)}}


def _create_folder(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new Dropbox folder.

    Args:
        path: Full Dropbox path for the new folder (e.g. "/Projects/NewFolder").
    """
    path = str(params.get("path", "")).strip()
    if not path:
        return {"ok": False, "error": "path is required"}

    res = _post("files/create_folder_v2", {"path": path, "autorename": False})
    res.raise_for_status()
    metadata = res.json().get("metadata", {})
    return {"ok": True, "data": {"path": metadata.get("path_display"), "id": metadata.get("id")}}


def _get_metadata(params: dict[str, Any]) -> dict[str, Any]:
    """
    Get metadata for a Dropbox file or folder.

    Args:
        path: Dropbox path.
    """
    path = str(params.get("path", "")).strip()
    if not path:
        return {"ok": False, "error": "path is required"}

    res = _post("files/get_metadata", {"path": path, "include_media_info": True})
    res.raise_for_status()
    return {"ok": True, "data": res.json()}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    "list_files": _list_files,
    "search_files": _search_files,
    "move_file": _move_file,
    "copy_file": _copy_file,
    "delete_file": _delete_file,
    "create_folder": _create_folder,
    "get_metadata": _get_metadata,
}


def dropbox_files(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Dropbox connector — manage files and folders.

    Parameters:
        operation: One of list_files | search_files | move_file | copy_file |
                   delete_file | create_folder | get_metadata
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] dropbox_files called args=%r", parameters)
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
        logger.warning("[dropbox_files] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning("[dropbox_files] HTTP %s for %s", exc.response.status_code, exc.request.url)
        return {"ok": False, "error": f"Dropbox API error {exc.response.status_code}: {exc.response.text[:300]}"}
    except Exception as exc:
        logger.exception("[dropbox_files] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
