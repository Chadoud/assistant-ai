"""Backend prefetch for mail/calendar read paths via integration tools."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from tool_registry import dispatch_sync

logger = logging.getLogger(__name__)


def _default_list_window() -> tuple[str, str]:
    now = datetime.now(UTC)
    end = now + timedelta(days=14)
    return now.isoformat(), end.isoformat()


def list_google_calendar_events(
    *,
    time_min: str | None = None,
    time_max: str | None = None,
    max_results: int = 25,
) -> dict[str, Any]:
    """List calendar events via ``google_workspace`` when tokens are relayed."""
    tmin, tmax = time_min, time_max
    if not tmin or not tmax:
        tmin, tmax = _default_list_window()
    try:
        return dispatch_sync(
            "google_workspace",
            {
                "operation": "list_calendar_events",
                "time_min": tmin,
                "time_max": tmax,
                "max_results": max_results,
            },
            approval_granted=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("list_google_calendar_events failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def search_gmail_messages(*, query: str = "", max_messages: int = 20) -> dict[str, Any]:
    """Search Gmail via server OAuth or relayed token."""
    try:
        from gmail_api_client import gmail_get_message, gmail_list_messages
        from gmail_google_oauth import get_valid_access_token

        token = get_valid_access_token()
        cap = min(max_messages, 50)
        list_resp = gmail_list_messages(token, query=query, max_results=cap)
        stubs: list[dict[str, str]] = list(list_resp.get("messages") or [])
        out: list[dict[str, Any]] = []
        for stub in stubs:
            if len(out) >= cap:
                break
            mid = str(stub.get("id") or "").strip()
            if not mid:
                continue
            meta = gmail_get_message(
                token,
                mid,
                message_format="metadata",
                metadata_headers=["From", "Subject", "Date"],
                get_token=get_valid_access_token,
            )
            payload = meta.get("payload")
            headers = payload.get("headers") if isinstance(payload, dict) else []
            hmap: dict[str, str] = {}
            if isinstance(headers, list):
                for h in headers:
                    if isinstance(h, dict) and h.get("name") and h.get("value"):
                        hmap[str(h["name"]).lower()] = str(h["value"])
            out.append(
                {
                    "id": mid,
                    "subject": (hmap.get("subject") or "").strip()[:500],
                    "from": (hmap.get("from") or "").strip()[:500],
                    "snippet": str(meta.get("snippet") or "").strip()[:500],
                    "date": (hmap.get("date") or "").strip()[:200],
                }
            )
        return {"ok": True, "data": {"messages": out, "count": len(out)}}
    except Exception as exc:  # noqa: BLE001
        logger.debug("search_gmail_messages failed: %s", exc)
        return {"ok": False, "error": str(exc)}
