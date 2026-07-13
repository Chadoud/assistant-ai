"""CalendarService — one create/confirm/delete flow for voice, text, and REST."""

from __future__ import annotations

import logging
import os
from typing import Any

from services.calendar.delete_needle import (
    extract_calendar_delete_needle,
    match_calendar_events_for_delete,
)

from .confirm import (
    CalendarConfirmActionKind,
    apply_calendar_draft_patch,
    execute_confirmed_calendar_draft,
    format_calendar_recap,
    needs_confirmation_tool_result,
    needs_input_tool_result,
    parse_calendar_confirm_response,
)
from .delete_batch import (
    build_batch_delete_draft,
    execute_batch_scoped_delete,
    series_batch_eligible,
)
from .delete_confirm import (
    CalendarDeleteActionKind,
    draft_from_payload,
    format_delete_recap,
    needs_delete_confirm_tool_result,
    needs_delete_scope_tool_result,
    parse_delete_confirm_response,
)
from .delete_draft import (
    CalendarDeleteDraft,
    build_delete_draft_from_event,
    collapse_delete_targets,
)
from .delete_execute import execute_scoped_delete
from .draft import (
    CalendarCreateDraft,
    build_calendar_create_draft,
    draft_missing_field,
    title_field_for_tool,
)
from .schemas import (
    BulkDeleteCalendarEventsRequest,
    CalendarCreateResponse,
    CalendarDeleteDraftPayload,
    CalendarDeleteResponse,
    CalendarDraftPayload,
    ConfirmCalendarDeleteRequest,
    ConfirmCalendarEventRequest,
    ProposeCalendarDeleteRequest,
    ProposeCalendarEventRequest,
    RecurrenceScope,
    SeriesDeleteTargetPayload,
)

logger = logging.getLogger(__name__)


def calendar_service_enabled() -> bool:
    """Feature flag for unified calendar service (on by default)."""
    val = os.environ.get("ASSISTANT_CALENDAR_SERVICE", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


def calendar_delete_confirm_enabled() -> bool:
    """Propose/confirm delete with recurrence scope (on by default)."""
    val = os.environ.get("ASSISTANT_CALENDAR_DELETE_CONFIRM", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


class CalendarService:
    """Authoritative calendar create-with-confirm and bulk delete."""

    @staticmethod
    def _ensure_enabled() -> None:
        if not calendar_service_enabled():
            raise RuntimeError("assistant_calendar_service_disabled")

    def draft_to_payload(self, draft: CalendarCreateDraft) -> CalendarDraftPayload:
        return CalendarDraftPayload(
            summary=draft.summary,
            start=draft.start,
            end=draft.end,
            tool_name=draft.tool_name,
        )

    def response_from_tool_result(self, result: dict[str, Any]) -> CalendarCreateResponse:
        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        status = str(data.get("status") or "failed")
        draft_data = data.get("draft") if isinstance(data.get("draft"), dict) else None
        draft = None
        if draft_data:
            draft = CalendarDraftPayload(
                summary=str(draft_data.get("summary") or ""),
                start=str(draft_data.get("start") or ""),
                end=str(draft_data.get("end") or ""),
                tool_name=str(draft_data.get("tool_name") or "google_workspace"),
            )
        elif data.get("summary") and data.get("start") and data.get("end"):
            draft = CalendarDraftPayload(
                summary=str(data["summary"]),
                start=str(data["start"]),
                end=str(data["end"]),
                tool_name=str(data.get("tool_name") or "google_workspace"),
            )
        return CalendarCreateResponse(
            ok=bool(result.get("ok", False)),
            status=status,  # type: ignore[arg-type]
            recap=str(data.get("recap") or "") or None,
            draft=draft,
            missing=data.get("missing"),  # type: ignore[arg-type]
            error=str(result.get("error") or "") or None,
            data=data or None,
        )

    def create_with_confirm(
        self,
        tool_name: str,
        args: dict[str, Any],
        source_text: str,
        *,
        pending: CalendarCreateDraft | None = None,
    ) -> tuple[CalendarCreateDraft | None, dict[str, Any]]:
        """
        Handle a calendar create tool call or user reply to a pending recap.

        Returns ``(updated_pending_draft_or_none, tool_result_dict)``.
        """
        self._ensure_enabled()
        enrich_source = source_text.strip()
        if pending is not None:
            action = parse_calendar_confirm_response(enrich_source, pending)
            if action.kind == CalendarConfirmActionKind.CONFIRM:
                result = execute_confirmed_calendar_draft(pending)
                if result.get("ok"):
                    return None, {
                        "ok": True,
                        "data": {
                            "status": "created",
                            "summary": pending.summary,
                            "start": pending.start,
                            "end": pending.end,
                            **(result.get("data") or {}),
                        },
                    }
                return None, {
                    "ok": False,
                    "data": {"status": "failed"},
                    "error": str(result.get("error") or "create failed"),
                }
            if action.kind == CalendarConfirmActionKind.REJECT:
                return None, {
                    "ok": True,
                    "data": {"status": "cancelled"},
                    "summary": "User cancelled. Acknowledge briefly in one sentence.",
                }
            if action.kind == CalendarConfirmActionKind.PATCH:
                updated = apply_calendar_draft_patch(pending, action.patch)
                return updated, needs_confirmation_tool_result(updated)
            return pending, needs_confirmation_tool_result(pending)

        draft = build_calendar_create_draft(tool_name, args, enrich_source)
        if draft is None:
            return None, {
                "ok": False,
                "error": "Missing calendar title or time — ask the user, then retry.",
            }

        missing = draft_missing_field(draft)
        if missing:
            return None, needs_input_tool_result(missing)

        return draft, needs_confirmation_tool_result(draft)

    def propose(self, body: ProposeCalendarEventRequest) -> CalendarCreateResponse:
        """Build a draft from natural language (text chat / REST)."""
        args: dict[str, Any] = {"operation": body.operation.strip()}
        if body.summary:
            field = title_field_for_tool(body.tool_name)
            args[field] = body.summary.strip()
            if field == "summary":
                args["subject"] = body.summary.strip()
        if body.start:
            args["start"] = body.start.strip()
        if body.end:
            args["end"] = body.end.strip()

        _pending, result = self.create_with_confirm(
            body.tool_name.strip(),
            args,
            body.source_text.strip(),
        )
        return self.response_from_tool_result(result)

    def execute_confirmed(self, body: ConfirmCalendarEventRequest) -> CalendarCreateResponse:
        """Create an event after explicit user confirmation."""
        self._ensure_enabled()
        draft = CalendarCreateDraft(
            tool_name=body.tool_name.strip(),
            args=dict(body.args) if body.args else {
                "operation": "create_calendar_event",
                body.title_field: body.summary,
                "start": body.start,
                "end": body.end,
            },
            source_text=body.source_text.strip(),
            summary=body.summary.strip(),
            start=body.start.strip(),
            end=body.end.strip(),
            title_field=body.title_field.strip() or "summary",
            confirm_state="confirmed",
        )
        result = execute_confirmed_calendar_draft(draft)
        if result.get("ok"):
            return CalendarCreateResponse(
                ok=True,
                status="created",
                recap=format_calendar_recap(draft).replace(" Je crée l'événement ?", ""),
                draft=self.draft_to_payload(draft),
                data=result.get("data") if isinstance(result.get("data"), dict) else None,
            )
        return CalendarCreateResponse(
            ok=False,
            status="failed",
            error=str(result.get("error") or "create failed"),
        )

    def bulk_delete(self, body: BulkDeleteCalendarEventsRequest) -> dict[str, Any]:
        """Delete multiple calendar events via the integration tool layer."""
        self._ensure_enabled()
        from tool_registry import dispatch_sync

        deleted: list[str] = []
        errors: list[dict[str, str]] = []
        tool_name = body.tool_name.strip() or "google_workspace"
        calendar_id = body.calendar_id.strip() or "primary"

        for event_id in body.event_ids:
            eid = str(event_id).strip()
            if not eid:
                continue
            try:
                result = dispatch_sync(
                    tool_name,
                    {
                        "operation": "delete_calendar_event",
                        "event_id": eid,
                        "calendar_id": calendar_id,
                    },
                    approval_granted=True,
                )
            except Exception as exc:  # noqa: BLE001
                errors.append({"event_id": eid, "error": str(exc)})
                continue
            if isinstance(result, dict) and result.get("ok"):
                deleted.append(eid)
            else:
                err = "delete failed"
                if isinstance(result, dict):
                    err = str(result.get("error") or err)
                errors.append({"event_id": eid, "error": err})

        ok = bool(deleted) and not errors
        return {
            "ok": ok or bool(deleted),
            "data": {
                "deleted_count": len(deleted),
                "deleted_event_ids": deleted,
                "errors": errors,
            },
            "error": (
                None
                if ok or deleted
                else (errors[0]["error"] if errors else "no events deleted")
            ),
        }

    def _draft_to_delete_payload(self, draft: CalendarDeleteDraft) -> CalendarDeleteDraftPayload:
        return CalendarDeleteDraftPayload(
            tool_name=draft.tool_name,
            calendar_id=draft.calendar_id,
            event_id=draft.event_id,
            recurring_event_id=draft.recurring_event_id,
            summary=draft.summary,
            start=draft.start,
            end=draft.end,
            is_recurring=draft.is_recurring,
            recurrence_label=draft.recurrence_label,
            source_text=draft.source_text,
            standalone_event_ids=draft.standalone_event_ids,
            additional_series=[
                SeriesDeleteTargetPayload(
                    event_id=target.event_id,
                    recurring_event_id=target.recurring_event_id,
                    summary=target.summary,
                    start=target.start,
                    end=target.end,
                )
                for target in draft.additional_series
            ],
            awaitingConfirm=True,
        )

    def plan_delete_from_events(
        self,
        events: list[dict[str, Any]],
        matched_ids: list[str],
        source_text: str,
        *,
        tool_name: str = "google_workspace",
        calendar_id: str = "primary",
    ) -> CalendarDeleteResponse | dict[str, Any]:
        """
        Decide propose-delete vs immediate bulk delete from list matches.

        Returns CalendarDeleteResponse for propose flow, or bulk_delete result dict.
        """
        self._ensure_enabled()
        needle = extract_calendar_delete_needle(source_text)
        if needle:
            allowed = set(match_calendar_events_for_delete(events, needle))
            if allowed:
                matched_ids = [event_id for event_id in matched_ids if event_id in allowed]

        standalone, series_events = collapse_delete_targets(events, matched_ids)

        if not standalone and not series_events and source_text.strip():
            needle = extract_calendar_delete_needle(source_text)
            if needle:
                rematched = match_calendar_events_for_delete(events, needle)
                if rematched:
                    standalone, series_events = collapse_delete_targets(events, rematched)

        if len(series_events) > 1:
            if not series_batch_eligible(series_events, source_text):
                return CalendarDeleteResponse(
                    ok=True,
                    status="failed",
                    error="Multiple recurring series matched — name one series to delete.",
                )
            draft = build_batch_delete_draft(
                series_events,
                tool_name=tool_name,
                calendar_id=calendar_id,
                source_text=source_text,
                standalone_event_ids=standalone,
            )
            return CalendarDeleteResponse(
                ok=True,
                status="needs_scope",
                recap=format_delete_recap(draft),
                draft=self._draft_to_delete_payload(draft),
                scope_options=["this_instance", "this_and_following", "all_series"],
            )

        if len(series_events) == 1:
            draft = build_delete_draft_from_event(
                series_events[0],
                tool_name=tool_name,
                calendar_id=calendar_id,
                source_text=source_text,
                standalone_event_ids=standalone,
            )
            if draft.is_recurring:
                return CalendarDeleteResponse(
                    ok=True,
                    status="needs_scope",
                    recap=format_delete_recap(draft),
                    draft=self._draft_to_delete_payload(draft),
                    scope_options=["this_instance", "this_and_following", "all_series"],
                )
            return CalendarDeleteResponse(
                ok=True,
                status="needs_confirmation",
                recap=format_delete_recap(draft),
                draft=self._draft_to_delete_payload(draft),
            )

        if standalone:
            return self.bulk_delete(
                BulkDeleteCalendarEventsRequest(
                    event_ids=standalone,
                    tool_name=tool_name,
                    calendar_id=calendar_id,
                )
            )

        return CalendarDeleteResponse(
            ok=True,
            status="failed",
            error="No matching events to delete.",
        )

    def fetch_events_for_delete(
        self,
        tool_name: str,
        *,
        needle: str | None = None,
        calendar_id: str = "primary",
    ) -> list[dict[str, Any]]:
        """
        Paginated calendar list for delete discovery.

        Uses a wide time window, optional Google ``q`` search, and instance
        expansion so recurring series masters can be collapsed before delete.
        """
        self._ensure_enabled()
        from tool_registry import dispatch_sync

        from .list_for_delete import build_delete_list_params

        list_result = dispatch_sync(
            tool_name.strip(),
            build_delete_list_params(needle=needle, calendar_id=calendar_id),
            approval_granted=True,
        )
        if not isinstance(list_result, dict) or not list_result.get("ok"):
            return []
        data = list_result.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("events"), list):
            return []
        return [e for e in data["events"] if isinstance(e, dict)]

    def propose_delete(self, body: ProposeCalendarDeleteRequest) -> CalendarDeleteResponse:
        """List, match, and return delete recap (or immediate bulk for standalone-only)."""
        self._ensure_enabled()

        needle = extract_calendar_delete_needle(body.source_text)
        events = self.fetch_events_for_delete(
            body.tool_name.strip(),
            needle=needle,
            calendar_id=body.calendar_id.strip() or "primary",
        )
        matched_ids = match_calendar_events_for_delete(events, needle)
        if not matched_ids:
            return CalendarDeleteResponse(
                ok=True,
                status="failed",
                error="No matching calendar events found.",
            )

        if not calendar_delete_confirm_enabled():
            bulk = self.bulk_delete(
                BulkDeleteCalendarEventsRequest(
                    event_ids=matched_ids,
                    tool_name=body.tool_name,
                    calendar_id=body.calendar_id,
                )
            )
            count = 0
            if isinstance(bulk, dict):
                data = bulk.get("data")
                if isinstance(data, dict):
                    count = int(data.get("deleted_count") or 0)
            if count:
                return CalendarDeleteResponse(
                    ok=True,
                    status="deleted",
                    deleted_count=count,
                    recap=f"Deleted {count} event(s).",
                )
            return CalendarDeleteResponse(
                ok=False,
                status="failed",
                error=str(bulk.get("error") if isinstance(bulk, dict) else "delete failed"),
            )

        plan = self.plan_delete_from_events(
            events,
            matched_ids,
            body.source_text,
            tool_name=body.tool_name,
            calendar_id=body.calendar_id,
        )
        if isinstance(plan, CalendarDeleteResponse):
            return plan
        count = int(plan.get("data", {}).get("deleted_count") or 0) if isinstance(plan, dict) else 0
        return CalendarDeleteResponse(
            ok=bool(plan.get("ok")) if isinstance(plan, dict) else False,
            status="deleted",
            deleted_count=count,
            recap=f"Deleted {count} event(s).",
            error=str(plan.get("error")) if isinstance(plan, dict) and plan.get("error") else None,
        )

    def delete_with_scope(
        self,
        draft: CalendarDeleteDraft,
        scope: RecurrenceScope,
    ) -> dict[str, Any]:
        """Execute one scoped delete plus any bundled standalone ids."""
        self._ensure_enabled()
        from tool_registry import dispatch_sync

        def _dispatch(tool: str, params: dict[str, Any]) -> dict[str, Any]:
            return dispatch_sync(tool, params, approval_granted=True)

        if draft.additional_series:
            return execute_batch_scoped_delete(draft, scope, dispatch=_dispatch)

        result = execute_scoped_delete(
            tool_name=draft.tool_name,
            scope=scope,
            calendar_id=draft.calendar_id,
            event_id=draft.event_id,
            recurring_event_id=draft.recurring_event_id,
            instance_start=draft.start,
            dispatch=_dispatch,
        )

        deleted = 0
        if isinstance(result, dict) and result.get("ok"):
            data = result.get("data")
            if isinstance(data, dict):
                deleted = int(data.get("deleted_count") or 1)

        if draft.standalone_event_ids:
            bulk = self.bulk_delete(
                BulkDeleteCalendarEventsRequest(
                    event_ids=draft.standalone_event_ids,
                    tool_name=draft.tool_name,
                    calendar_id=draft.calendar_id,
                )
            )
            if isinstance(bulk, dict):
                data = bulk.get("data")
                if isinstance(data, dict):
                    deleted += int(data.get("deleted_count") or 0)

        if isinstance(result, dict):
            if result.get("ok"):
                result.setdefault("data", {})
                if isinstance(result["data"], dict):
                    result["data"]["deleted_count"] = deleted
            elif deleted > 0:
                return {
                    "ok": True,
                    "data": {"deleted_count": deleted, "partial_failure": True},
                    "error": result.get("error"),
                }
        return result

    def confirm_delete(self, body: ConfirmCalendarDeleteRequest) -> CalendarDeleteResponse:
        """Execute or cancel a pending delete after user confirmation."""
        self._ensure_enabled()
        draft = draft_from_payload(body.draft.model_dump())
        reply = body.user_reply.strip()

        if body.scope:
            scope = body.scope
        else:
            action = parse_delete_confirm_response(reply, draft)
            if action.kind == CalendarDeleteActionKind.REJECT:
                logger.info(
                    "calendar_delete_cancelled tool=%s event_id=%s",
                    draft.tool_name,
                    draft.event_id,
                )
                return CalendarDeleteResponse(ok=True, status="cancelled", recap="Cancelled.")
            if action.kind == CalendarDeleteActionKind.SCOPE and action.scope:
                scope = action.scope
            elif action.kind == CalendarDeleteActionKind.CONFIRM:
                scope = "this_instance"
            elif draft.is_recurring:
                return CalendarDeleteResponse(
                    ok=True,
                    status="needs_scope",
                    recap=format_delete_recap(draft),
                    draft=body.draft,
                    scope_options=["this_instance", "this_and_following", "all_series"],
                )
            else:
                return CalendarDeleteResponse(
                    ok=True,
                    status="needs_confirmation",
                    recap=format_delete_recap(draft),
                    draft=body.draft,
                )

        result = self.delete_with_scope(draft, scope)
        if isinstance(result, dict) and result.get("ok"):
            data = result.get("data") if isinstance(result.get("data"), dict) else {}
            count = int(data.get("deleted_count") or 1)
            logger.info(
                "calendar_delete_scope=%s provider=%s deleted_count=%s partial_failure=%s",
                scope,
                draft.tool_name,
                count,
                bool(data.get("partial_failure")),
            )
            return CalendarDeleteResponse(
                ok=True,
                status="deleted",
                deleted_count=count,
                recap=format_delete_recap(draft).split("?")[0].strip(),
                data=data,
            )
        err = str(result.get("error") if isinstance(result, dict) else "delete failed")
        return CalendarDeleteResponse(ok=False, status="failed", error=err)

    def delete_tool_result_for_plan(
        self,
        events: list[dict[str, Any]],
        matched_ids: list[str],
        source_text: str,
        *,
        tool_name: str = "google_workspace",
    ) -> dict[str, Any]:
        """Voice/tool_dispatch: return synthetic tool result for delete propose."""
        if not calendar_delete_confirm_enabled():
            bulk = self.bulk_delete(
                BulkDeleteCalendarEventsRequest(event_ids=matched_ids, tool_name=tool_name)
            )
            return bulk if isinstance(bulk, dict) else {"ok": False, "error": "delete failed"}

        plan = self.plan_delete_from_events(
            events, matched_ids, source_text, tool_name=tool_name
        )
        if isinstance(plan, CalendarDeleteResponse):
            if plan.status == "needs_scope" and plan.draft:
                draft = draft_from_payload(plan.draft.model_dump())
                return needs_delete_scope_tool_result(draft)
            if plan.status == "needs_confirmation" and plan.draft:
                draft = draft_from_payload(plan.draft.model_dump())
                return needs_delete_confirm_tool_result(draft)
            return {"ok": False, "error": plan.error or "delete failed"}
        return plan if isinstance(plan, dict) else {"ok": False, "error": "delete failed"}


_default_service = CalendarService()


def get_calendar_service() -> CalendarService:
    """Return the process-wide CalendarService singleton."""
    return _default_service
