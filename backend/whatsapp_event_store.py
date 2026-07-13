"""In-memory WhatsApp Cloud event cache fed by Electron cloud poll → local relay."""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any

MAX_EVENTS = 500
SESSION_WINDOW_SECONDS = 24 * 60 * 60

_lock = threading.Lock()
_events: deque[dict[str, Any]] = deque(maxlen=MAX_EVENTS)
_last_inbound_ms_by_from: dict[str, int] = {}


@dataclass(frozen=True)
class SessionCheck:
    """Whether a free-text Cloud send is likely allowed for a recipient."""

    open: bool
    last_inbound_ms: int | None
    reason: str


def ingest_events(events: list[dict[str, Any]]) -> int:
    """Append webhook-derived events from the desktop relay."""
    if not events:
        return 0
    added = 0
    with _lock:
        for raw in events:
            if not isinstance(raw, dict):
                continue
            event_type = str(raw.get("event_type") or "").strip()
            if event_type not in ("message", "status"):
                continue
            row = {
                "id": raw.get("id"),
                "event_type": event_type,
                "wa_message_id": str(raw.get("wa_message_id") or ""),
                "from_e164": str(raw.get("from_e164") or ""),
                "to_e164": str(raw.get("to_e164") or ""),
                "status": str(raw.get("status") or "") or None,
                "body_preview": str(raw.get("body_preview") or "")[:512] or None,
                "meta_timestamp_ms": _as_int(raw.get("meta_timestamp_ms")),
                "created_at_ms": _as_int(raw.get("created_at_ms")) or int(time.time() * 1000),
            }
            _events.append(row)
            if event_type == "message":
                from_digits = _digits_only(str(row.get("from_e164") or ""))
                ts = row.get("meta_timestamp_ms") or row.get("created_at_ms")
                if from_digits and isinstance(ts, int):
                    prev = _last_inbound_ms_by_from.get(from_digits)
                    if prev is None or ts > prev:
                        _last_inbound_ms_by_from[from_digits] = ts
            added += 1
    return added


def _as_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def recent_events(*, limit: int = 20, event_type: str | None = None) -> list[dict[str, Any]]:
    """Return newest events first."""
    safe_limit = min(max(int(limit), 1), 100)
    with _lock:
        rows = list(_events)
    if event_type:
        rows = [row for row in rows if row.get("event_type") == event_type]
    rows.reverse()
    return rows[:safe_limit]


def last_inbound_timestamp_ms(recipient_e164: str) -> int | None:
    """
    Latest inbound user message timestamp for a contact (they messaged the business).
    """
    digits = _digits_only(recipient_e164)
    if not digits:
        return None
    with _lock:
        return _last_inbound_ms_by_from.get(digits)


def session_check(recipient_e164: str) -> SessionCheck:
    """Meta 24-hour customer care session — opens when the user last messaged the business."""
    last_ms = last_inbound_timestamp_ms(recipient_e164)
    if last_ms is None:
        return SessionCheck(
            open=False,
            last_inbound_ms=None,
            reason="No recent inbound message from this number — use send_template or desktop WhatsApp.",
        )
    age_s = max(0, int(time.time() * 1000) - last_ms) // 1000
    if age_s <= SESSION_WINDOW_SECONDS:
        return SessionCheck(
            open=True,
            last_inbound_ms=last_ms,
            reason="Session open — free-text send is allowed.",
        )
    return SessionCheck(
        open=False,
        last_inbound_ms=last_ms,
        reason="Outside the 24-hour reply window — use send_template or desktop WhatsApp.",
    )


def delivery_status(wa_message_id: str) -> dict[str, Any] | None:
    """Latest delivery status event for an outbound message id."""
    needle = str(wa_message_id or "").strip()
    if not needle:
        return None
    latest: dict[str, Any] | None = None
    latest_ts = -1
    with _lock:
        for row in _events:
            if row.get("event_type") != "status":
                continue
            if str(row.get("wa_message_id") or "") != needle:
                continue
            ts = row.get("meta_timestamp_ms") or row.get("created_at_ms") or 0
            if isinstance(ts, int) and ts >= latest_ts:
                latest_ts = ts
                latest = row
    return latest


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def clear_events_for_tests() -> None:
    """Test helper."""
    with _lock:
        _events.clear()
        _last_inbound_ms_by_from.clear()
