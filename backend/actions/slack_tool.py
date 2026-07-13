"""
Slack connector — list channels, send messages, search messages, channel history, users.

Uses the Slack Web API with the OAuth user token stored under provider ID
"slack" in connector_credentials.

Operations:
  list_channels, send_message, search_messages, get_channel_history, list_users
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)

_SLACK_API = "https://slack.com/api"


def _token() -> str:
    return try_get_token("slack")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_token()}",
        "Content-Type": "application/json; charset=utf-8",
    }


def _friendly_slack_error(raw: str) -> str:
    """Map Slack API errors to actionable user-facing messages."""
    lower = raw.lower()
    if "missing_scope" in lower:
        return (
            "Slack needs updated permissions. Disconnect Slack in External sources, "
            "then connect again."
        )
    if "not_authed" in lower or "invalid_auth" in lower:
        return "Slack is not connected. Connect Slack in External sources first."
    if "channel_not_found" in lower:
        return "That Slack channel was not found. Check the name or pick from your channel list."
    return raw


def _api_get(method: str, params: dict[str, Any]) -> dict[str, Any]:
    res = httpx.get(f"{_SLACK_API}/{method}", headers=_headers(), params=params, timeout=15)
    res.raise_for_status()
    data = res.json()
    if not data.get("ok"):
        err = f"Slack API error: {data.get('error', 'unknown')}"
        raise RuntimeError(_friendly_slack_error(err))
    return data


def _api_post(method: str, body: dict[str, Any]) -> dict[str, Any]:
    res = httpx.post(
        f"{_SLACK_API}/{method}",
        headers=_headers(),
        content=json.dumps(body),
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()
    if not data.get("ok"):
        err = f"Slack API error: {data.get('error', 'unknown')}"
        raise RuntimeError(_friendly_slack_error(err))
    return data


# ── Operations ────────────────────────────────────────────────────────────────

def _list_channels(params: dict[str, Any]) -> dict[str, Any]:
    """
    List public and private Slack channels the bot is a member of.

    Args:
        limit: Maximum channels to return (default 50, max 200).
        types: Channel types to include, comma-separated
               (default "public_channel,private_channel").
    """
    limit = min(int(params.get("limit", 50)), 200)
    types = str(params.get("types", "public_channel,private_channel")).strip()

    data = _api_get(
        "conversations.list",
        {"limit": limit, "types": types, "exclude_archived": True},
    )
    channels = [
        {
            "id": c.get("id"),
            "name": c.get("name"),
            "is_private": c.get("is_private", False),
            "topic": c.get("topic", {}).get("value", ""),
            "member_count": c.get("num_members", 0),
        }
        for c in data.get("channels", [])
    ]
    return {"ok": True, "data": {"channels": channels, "count": len(channels)}}


def _send_message(params: dict[str, Any]) -> dict[str, Any]:
    """
    Send a message to a Slack channel or user.

    Args:
        channel: Channel ID (e.g. "C01234567") or channel name (e.g. "#general")
                 or user ID for a DM.
        text: Message text (supports Slack mrkdwn formatting).
        thread_ts: Optional thread timestamp to reply in a thread.
    """
    channel = str(params.get("channel", "")).strip()
    text = str(params.get("text", "")).strip()
    thread_ts = str(params.get("thread_ts", "")).strip()

    if not channel or not text:
        return {"ok": False, "error": "channel and text are required"}

    body: dict[str, Any] = {"channel": channel, "text": text}
    if thread_ts:
        body["thread_ts"] = thread_ts

    data = _api_post("chat.postMessage", body)
    return {"ok": True, "data": {"ts": data.get("ts"), "channel": data.get("channel")}}


def _search_messages(params: dict[str, Any]) -> dict[str, Any]:
    """
    Search Slack messages across all channels the user has access to.

    Requires a User OAuth token with search:read scope (not just a Bot token).

    Args:
        query: Search query string.
        count: Number of results to return (default 20, max 100).
        sort: Sort order — "score" or "timestamp" (default "timestamp").
    """
    query = str(params.get("query", "")).strip()
    count = min(int(params.get("count", 20)), 100)
    sort = str(params.get("sort", "timestamp")).strip()

    if not query:
        return {"ok": False, "error": "query is required"}

    data = _api_get("search.messages", {"query": query, "count": count, "sort": sort})
    matches = data.get("messages", {}).get("matches", [])
    results = [
        {
            "ts": m.get("ts"),
            "channel_name": m.get("channel", {}).get("name"),
            "username": m.get("username"),
            "text": m.get("text", ""),
            "permalink": m.get("permalink"),
        }
        for m in matches
    ]
    return {"ok": True, "data": {"results": results, "count": len(results)}}


def _get_channel_history(params: dict[str, Any]) -> dict[str, Any]:
    """
    Retrieve recent message history from a Slack channel.

    Args:
        channel: Channel ID (e.g. "C01234567").
        limit: Maximum messages to return (default 20, max 100).
        oldest: Only return messages after this Unix timestamp (optional).
    """
    channel = str(params.get("channel", "")).strip()
    limit = min(int(params.get("limit", 20)), 100)

    if not channel:
        return {"ok": False, "error": "channel is required"}

    query: dict[str, Any] = {"channel": channel, "limit": limit}
    if params.get("oldest"):
        query["oldest"] = str(params["oldest"])

    data = _api_get("conversations.history", query)
    messages = [
        {
            "ts": m.get("ts"),
            "user": m.get("user"),
            "text": m.get("text", ""),
            "reply_count": m.get("reply_count", 0),
        }
        for m in data.get("messages", [])
        if m.get("type") == "message"
    ]
    return {"ok": True, "data": {"messages": messages, "count": len(messages)}}


def _list_users(params: dict[str, Any]) -> dict[str, Any]:
    """
    List Slack workspace members.

    Args:
        limit: Maximum users to return (default 50, max 200).
    """
    limit = min(int(params.get("limit", 50)), 200)
    data = _api_get("users.list", {"limit": limit})
    members = [
        {
            "id": u.get("id"),
            "name": u.get("name"),
            "real_name": u.get("real_name"),
            "is_bot": u.get("is_bot", False),
        }
        for u in data.get("members", [])
        if not u.get("deleted") and not u.get("is_ultra_restricted")
    ]
    return {"ok": True, "data": {"users": members, "count": len(members)}}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_OPERATIONS: dict[str, Any] = {
    "list_channels": _list_channels,
    "send_message": _send_message,
    "search_messages": _search_messages,
    "get_channel_history": _get_channel_history,
    "list_users": _list_users,
}


def slack_messaging(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Slack connector — channels, messages, and users.

    Parameters:
        operation: One of list_channels | send_message | search_messages |
                   get_channel_history | list_users
        (operation-specific params): See individual operation docstrings above.
    """
    logger.debug("[action] slack_messaging called args=%r", parameters)
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
        logger.warning("[slack_messaging] credential unavailable: %s", exc)
        return {"ok": False, "error": str(exc)}
    except RuntimeError as exc:
        logger.warning("[slack_messaging] API error: %s", exc)
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        logger.warning("[slack_messaging] HTTP %s for %s", code, exc.request.url)
        snippet = exc.response.text[:300]
        return {"ok": False, "error": f"Slack HTTP error {code}: {snippet}"}
    except Exception as exc:
        logger.exception("[slack_messaging] unexpected error in operation=%r", operation)
        return {"ok": False, "error": str(exc)}
