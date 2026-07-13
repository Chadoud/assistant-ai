"""Execute calendar delete for a recurrence scope — provider-specific."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from .schemas import RecurrenceScope

logger = logging.getLogger(__name__)

DispatchFn = Callable[[str, dict[str, Any]], dict[str, Any]]


def execute_scoped_delete(
    *,
    tool_name: str,
    scope: RecurrenceScope,
    calendar_id: str,
    event_id: str,
    recurring_event_id: str | None,
    instance_start: str | None,
    dispatch: DispatchFn,
) -> dict[str, Any]:
    """Delete one calendar target with the chosen recurrence scope."""
    if tool_name == "microsoft_graph":
        return _execute_microsoft_delete(
            scope=scope,
            calendar_id=calendar_id,
            event_id=event_id,
            recurring_event_id=recurring_event_id,
            instance_start=instance_start,
            dispatch=dispatch,
        )
    return _execute_google_delete(
        scope=scope,
        calendar_id=calendar_id,
        event_id=event_id,
        recurring_event_id=recurring_event_id,
        instance_start=instance_start,
        dispatch=dispatch,
    )


def _execute_google_delete(
    *,
    scope: RecurrenceScope,
    calendar_id: str,
    event_id: str,
    recurring_event_id: str | None,
    instance_start: str | None,
    dispatch: DispatchFn,
) -> dict[str, Any]:
    if scope == "this_instance" or not recurring_event_id:
        return dispatch(
            "google_workspace",
            {
                "operation": "delete_calendar_event",
                "event_id": event_id,
                "calendar_id": calendar_id,
            },
        )

    if scope == "all_series":
        return dispatch(
            "google_workspace",
            {
                "operation": "delete_calendar_event",
                "event_id": recurring_event_id,
                "calendar_id": calendar_id,
            },
        )

    # this_and_following: trim series master RRULE, then remove future instances
    master = dispatch(
        "google_workspace",
        {
            "operation": "get_calendar_event",
            "event_id": recurring_event_id,
            "calendar_id": calendar_id,
        },
    )
    if not isinstance(master, dict) or not master.get("ok"):
        err = str(master.get("error") if isinstance(master, dict) else "master fetch failed")
        return {"ok": False, "error": err}

    master_data = master.get("data") if isinstance(master.get("data"), dict) else {}
    recurrence = master_data.get("recurrence")
    if not isinstance(recurrence, list):
        return {
            "ok": False,
            "error": "Could not read recurrence on the series — open Google Calendar to adjust it.",
        }

    until_rules = _rrule_with_until_before(
        recurrence,
        instance_start or "",
        str(master_data.get("start_time_zone") or "UTC"),
    )
    patch_result = dispatch(
        "google_workspace",
        {
            "operation": "patch_calendar_recurrence",
            "event_id": recurring_event_id,
            "calendar_id": calendar_id,
            "recurrence": until_rules,
        },
    )
    if not isinstance(patch_result, dict) or not patch_result.get("ok"):
        err = str(patch_result.get("error") if isinstance(patch_result, dict) else "patch failed")
        return {"ok": False, "error": err}

    deleted_future = 0
    errors: list[str] = []
    if instance_start:
        instances = dispatch(
            "google_workspace",
            {
                "operation": "list_calendar_instances",
                "event_id": recurring_event_id,
                "calendar_id": calendar_id,
                "time_min": instance_start,
            },
        )
        inst_list: list[dict[str, Any]] = []
        if isinstance(instances, dict) and instances.get("ok"):
            data = instances.get("data")
            if isinstance(data, dict) and isinstance(data.get("events"), list):
                inst_list = [e for e in data["events"] if isinstance(e, dict)]

        for inst in inst_list:
            iid = str(inst.get("id") or "").strip()
            if not iid:
                continue
            dr = dispatch(
                "google_workspace",
                {
                    "operation": "delete_calendar_event",
                    "event_id": iid,
                    "calendar_id": calendar_id,
                },
            )
            if isinstance(dr, dict) and dr.get("ok"):
                deleted_future += 1
            else:
                errors.append(str(dr.get("error") if isinstance(dr, dict) else "delete failed"))

    partial = bool(errors)
    return {
        "ok": not partial or deleted_future > 0,
        "data": {
            "deleted_count": max(1, deleted_future),
            "scope": scope,
            "partial_failure": partial,
            "errors": errors,
        },
        "error": (
            f"Removed {deleted_future} future events but some could not be deleted — "
            "check Google Calendar to finish."
            if partial
            else None
        ),
    }


def _execute_microsoft_delete(
    *,
    scope: RecurrenceScope,
    calendar_id: str,
    event_id: str,
    recurring_event_id: str | None,
    instance_start: str | None,
    dispatch: DispatchFn,
) -> dict[str, Any]:
    master_id = recurring_event_id or event_id
    if scope == "this_instance" or not recurring_event_id:
        return dispatch(
            "microsoft_graph",
            {
                "operation": "delete_calendar_event",
                "event_id": event_id,
                "calendar_id": calendar_id,
            },
        )

    if scope == "all_series":
        return dispatch(
            "microsoft_graph",
            {
                "operation": "delete_calendar_event",
                "event_id": master_id,
                "calendar_id": calendar_id,
            },
        )

    end_date = _day_before_iso(instance_start)
    if not end_date:
        return {"ok": False, "error": "Could not determine the event date for this and following."}

    patch = dispatch(
        "microsoft_graph",
        {
            "operation": "patch_calendar_recurrence_end",
            "event_id": master_id,
            "calendar_id": calendar_id,
            "end_date": end_date,
        },
    )
    if not isinstance(patch, dict) or not patch.get("ok"):
        err = str(patch.get("error") if isinstance(patch, dict) else "patch failed")
        return {"ok": False, "error": err}

    dr = dispatch(
        "microsoft_graph",
        {
            "operation": "delete_calendar_event",
            "event_id": event_id,
            "calendar_id": calendar_id,
        },
    )
    ok = isinstance(dr, dict) and dr.get("ok")
    return {
        "ok": ok,
        "data": {"deleted_count": 1 if ok else 0, "scope": scope},
        "error": None if ok else str(dr.get("error") if isinstance(dr, dict) else "delete failed"),
    }


def _parse_iso(iso: str) -> datetime | None:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None


def _day_before_iso(iso: str | None) -> str | None:
    dt = _parse_iso(iso or "")
    if dt is None:
        return None
    prev = (dt - timedelta(days=1)).date()
    return prev.isoformat()


def _rrule_with_until_before(
    recurrence: list[str],
    instance_start: str,
    time_zone: str,
) -> list[str]:
    """Set RRULE UNTIL to the day before ``instance_start`` (series stops before that occurrence)."""
    inst = _parse_iso(instance_start)
    if inst is None:
        return recurrence
    try:
        tz = ZoneInfo(time_zone)
        inst = inst.astimezone(tz)
    except Exception:
        pass
    until_day = (inst - timedelta(days=1)).date()
    until_str = until_day.strftime("%Y%m%dT235959Z")
    out: list[str] = []
    for rule in recurrence:
        if not rule.upper().startswith("RRULE:"):
            out.append(rule)
            continue
        body = rule[6:]
        body = re.sub(r";?UNTIL=[^;]+", "", body, flags=re.I)
        body = re.sub(r";?COUNT=\d+", "", body, flags=re.I)
        out.append(f"RRULE:{body};UNTIL={until_str}")
    return out
