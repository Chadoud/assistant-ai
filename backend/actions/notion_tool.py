"""
Notion connector — search, read, create, and append to Notion pages/databases.

Uses the Notion API (https://developers.notion.com) via httpx with the OAuth
access token stored under provider ID "notion" in connector_credentials.

Operations:
  search, read_page, create_page, append_text, query_database
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_API_BASE = "https://api.notion.com/v1"
_NOTION_VERSION = "2022-06-28"

# Notion's rich-text content is capped at 2000 chars per text object.
_MAX_TEXT_CHUNK = 2000
# Keep tool payloads small so the model summarizes rather than dumps raw JSON.
_MAX_SEARCH_RESULTS = 25
_MAX_BLOCKS_READ = 100


def _token() -> str:
    return try_get_token("notion")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Notion-Version": _NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _post(endpoint: str, body: dict[str, Any]) -> httpx.Response:
    return httpx.post(
        f"{_API_BASE}/{endpoint}", headers=_headers(), content=json.dumps(body), timeout=20
    )


def _get(endpoint: str) -> httpx.Response:
    return httpx.get(f"{_API_BASE}/{endpoint}", headers=_headers(), timeout=20)


# ── Rich-text helpers ───────────────────────────────────────────────────────

def _rich_text(content: str) -> list[dict[str, Any]]:
    """Build a Notion rich-text array from a plain string (single chunk, capped)."""
    return [{"type": "text", "text": {"content": content[:_MAX_TEXT_CHUNK]}}]


def _plain_text(rich: list[dict[str, Any]] | None) -> str:
    """Flatten a Notion rich-text array to a plain string."""
    if not rich:
        return ""
    return "".join(str(part.get("plain_text", "")) for part in rich)


def _paragraph_blocks(text: str) -> list[dict[str, Any]]:
    """Turn a multi-line string into one paragraph block per non-empty line."""
    blocks: list[dict[str, Any]] = []
    for line in text.splitlines() or [text]:
        line = line.strip()
        if not line:
            continue
        blocks.append(
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": _rich_text(line)},
            }
        )
    return blocks


def _title_of(obj: dict[str, Any]) -> str:
    """Extract a human title from a Notion page or database object."""
    if obj.get("object") == "database":
        return _plain_text(obj.get("title")) or "(untitled database)"
    props = obj.get("properties", {})
    for prop in props.values():
        if isinstance(prop, dict) and prop.get("type") == "title":
            title = _plain_text(prop.get("title"))
            if title:
                return title
    return "(untitled)"


def _block_text(block: dict[str, Any]) -> str:
    """Best-effort plain text for a single Notion block."""
    block_type = block.get("type", "")
    payload = block.get(block_type, {})
    if isinstance(payload, dict) and "rich_text" in payload:
        return _plain_text(payload.get("rich_text"))
    return ""


# ── Operations ────────────────────────────────────────────────────────────────

def _search(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search shared Notion pages and databases, newest-edited first.

    Args:
        query: Optional text to match in titles. Leave empty to list the most
            recently edited pages/databases (use this when the user asks to
            "look at" or "summarize" their Notion without giving keywords).
        filter: Optional "page" or "database" to restrict the object type.
        max_results: Maximum results (default 25).
    """
    query = str(params.get("query", "")).strip()
    obj_filter = str(params.get("filter", "")).strip().lower()
    max_results = min(int(params.get("max_results", _MAX_SEARCH_RESULTS)), _MAX_SEARCH_RESULTS)

    # Sort newest-first so an empty query returns the most recently edited pages —
    # this is how "summarize my latest Notion pages" (no keywords) is served.
    body: dict[str, Any] = {
        "page_size": max_results,
        "sort": {"direction": "descending", "timestamp": "last_edited_time"},
    }
    if query:
        body["query"] = query
    if obj_filter in ("page", "database"):
        body["filter"] = {"property": "object", "value": obj_filter}

    res = _post("search", body)
    res.raise_for_status()
    results = [
        {
            "id": item.get("id"),
            "object": item.get("object"),
            "title": _title_of(item),
            "url": item.get("url"),
            "last_edited": item.get("last_edited_time"),
        }
        for item in res.json().get("results", [])
    ]
    return {"ok": True, "data": {"results": results, "count": len(results)}}


def _read_page(params: dict[str, Any]) -> dict[str, Any]:
    """
    Read a Notion page's title and text content.

    Args:
        page_id: The Notion page ID.
    """
    page_id = str(params.get("page_id", "")).strip()
    if not page_id:
        return {"ok": False, "error": "page_id is required"}

    page_res = _get(f"pages/{page_id}")
    page_res.raise_for_status()
    page = page_res.json()

    blocks_res = _get(f"blocks/{page_id}/children?page_size={_MAX_BLOCKS_READ}")
    blocks_res.raise_for_status()
    lines = [
        text
        for block in blocks_res.json().get("results", [])
        if (text := _block_text(block))
    ]

    return {
        "ok": True,
        "data": {
            "id": page_id,
            "title": _title_of(page),
            "url": page.get("url"),
            "content": "\n".join(lines),
            "truncated": len(blocks_res.json().get("results", [])) >= _MAX_BLOCKS_READ,
        },
    }


def _create_page(params: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new Notion page under a parent page (or database).

    Args:
        title: Title of the new page.
        parent_page_id: Parent page ID (use this for a normal page).
        parent_database_id: Parent database ID (alternative to parent_page_id).
        body: Optional plain-text body; each line becomes a paragraph.
    """
    title = str(params.get("title", "")).strip()
    parent_page_id = str(params.get("parent_page_id", "")).strip()
    parent_database_id = str(params.get("parent_database_id", "")).strip()
    body_text = str(params.get("body", "")).strip()

    if not title:
        return {"ok": False, "error": "title is required"}
    if not parent_page_id and not parent_database_id:
        return {"ok": False, "error": "parent_page_id or parent_database_id is required"}

    title_property = {"title": {"title": _rich_text(title)}}
    if parent_database_id:
        parent = {"database_id": parent_database_id}
    else:
        parent = {"page_id": parent_page_id}

    payload: dict[str, Any] = {"parent": parent, "properties": title_property}
    if body_text:
        payload["children"] = _paragraph_blocks(body_text)

    res = _post("pages", payload)
    res.raise_for_status()
    created = res.json()
    return {"ok": True, "data": {"id": created.get("id"), "url": created.get("url"), "title": title}}


def _append_text(params: dict[str, Any]) -> dict[str, Any]:
    """
    Append paragraph text to an existing Notion page.

    Args:
        page_id: The page (block) ID to append to.
        text: Plain text; each line becomes a paragraph block.
    """
    page_id = str(params.get("page_id", "")).strip()
    text = str(params.get("text", "")).strip()
    if not page_id:
        return {"ok": False, "error": "page_id is required"}
    if not text:
        return {"ok": False, "error": "text is required"}

    res = httpx.patch(
        f"{_API_BASE}/blocks/{page_id}/children",
        headers=_headers(),
        content=json.dumps({"children": _paragraph_blocks(text)}),
        timeout=20,
    )
    res.raise_for_status()
    appended = res.json().get("results", [])
    return {"ok": True, "data": {"page_id": page_id, "blocks_added": len(appended)}}


def _query_database(params: dict[str, Any]) -> dict[str, Any]:
    """
    Query rows of a Notion database.

    Args:
        database_id: The database ID.
        max_results: Maximum rows to return (default 25).
    """
    database_id = str(params.get("database_id", "")).strip()
    if not database_id:
        return {"ok": False, "error": "database_id is required"}
    max_results = min(int(params.get("max_results", _MAX_SEARCH_RESULTS)), _MAX_SEARCH_RESULTS)

    res = _post(f"databases/{database_id}/query", {"page_size": max_results})
    res.raise_for_status()
    rows = [
        {
            "id": row.get("id"),
            "title": _title_of(row),
            "url": row.get("url"),
            "last_edited": row.get("last_edited_time"),
        }
        for row in res.json().get("results", [])
    ]
    return {"ok": True, "data": {"rows": rows, "count": len(rows)}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    "search": _search,
    "read_page": _read_page,
    "create_page": _create_page,
    "append_text": _append_text,
    "query_database": _query_database,
}


def notion(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Notion connector — search, read, create, and append to pages/databases.

    Parameters:
        operation: One of search | read_page | create_page | append_text | query_database
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] notion called args=%r", parameters)
    operation = str(parameters.get("operation", "")).strip()

    if not operation:
        return {"ok": False, "error": f"operation is required. Available: {sorted(_OPERATIONS)}"}

    handler = _OPERATIONS.get(operation)
    if handler is None:
        return {
            "ok": False,
            "error": f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}",
        }

    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        logger.warning("[notion] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        logger.warning("[notion] HTTP %s for %s", exc.response.status_code, exc.request.url)
        detail = exc.response.text[:300]
        if exc.response.status_code in (401, 403):
            detail += " — make sure the page/database is shared with your Notion integration."
        return {"ok": False, "error": f"Notion API error {exc.response.status_code}: {detail}"}
    except Exception as exc:
        logger.exception("[notion] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
