"""Plain-language labels for calendar recurrence rules."""

from __future__ import annotations

import re
from typing import Any

_BYDAY_LABELS = {
    "MO": "Monday",
    "TU": "Tuesday",
    "WE": "Wednesday",
    "TH": "Thursday",
    "FR": "Friday",
    "SA": "Saturday",
    "SU": "Sunday",
}


def describe_recurrence_label(recurrence_rules: list[str] | None) -> str | None:
    """Turn RRULE lines into a short user-facing phrase (e.g. 'every Tuesday')."""
    if not recurrence_rules:
        return None
    for rule in recurrence_rules:
        if not rule.upper().startswith("RRULE:"):
            continue
        body = rule[6:]
        freq_match = re.search(r"FREQ=([A-Z]+)", body, re.I)
        if not freq_match:
            continue
        freq = freq_match.group(1).upper()
        if freq == "DAILY":
            return "every day"
        if freq == "WEEKLY":
            byday = re.search(r"BYDAY=([A-Z,]+)", body, re.I)
            if byday:
                days = byday.group(1).upper().split(",")
                labels = [_BYDAY_LABELS.get(d, d) for d in days if d]
                if len(labels) == 1:
                    return f"every {labels[0]}"
                if labels:
                    return "every " + ", ".join(labels[:-1]) + f" and {labels[-1]}"
            return "every week"
        if freq == "MONTHLY":
            return "every month"
        if freq == "YEARLY":
            return "every year"
    return "on a schedule"


def event_is_recurring_instance(event: dict[str, Any]) -> bool:
    """True when the listed event is an instance of a recurring series."""
    return bool(str(event.get("recurring_event_id") or event.get("recurringEventId") or "").strip())
