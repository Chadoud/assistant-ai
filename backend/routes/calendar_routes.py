"""HTTP routes for calendar event creation (shared by text chat and tooling)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.calendar import (
    BulkDeleteCalendarEventsRequest,
    ConfirmCalendarDeleteRequest,
    ConfirmCalendarEventRequest,
    ProposeCalendarDeleteRequest,
    ProposeCalendarEventRequest,
    calendar_service_enabled,
    get_calendar_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["calendar"])


class CreateCalendarEventRequest(BaseModel):
    """Body for creating a calendar event via a connected provider (direct create)."""

    summary: str = Field(..., min_length=1, max_length=500)
    start: str = Field(..., description="ISO 8601 start datetime")
    end: str = Field(..., description="ISO 8601 end datetime")
    description: str | None = None
    location: str | None = None
    provider: str = Field(default="google", description="google | microsoft")


def _tool_name_for_provider(provider: str) -> str:
    return "microsoft_graph" if provider.strip().lower() == "microsoft" else "google_workspace"


def _require_calendar_service() -> None:
    if not calendar_service_enabled():
        raise HTTPException(status_code=404, detail="assistant_calendar_service_disabled")


@router.post("/integrations/calendar/events/propose")
def propose_calendar_event(body: ProposeCalendarEventRequest) -> dict[str, Any]:
    """Build a draft and return needs_confirmation / needs_input (shared contract)."""
    _require_calendar_service()
    response = get_calendar_service().propose(body)
    return response.model_dump(exclude_none=True)


@router.post("/integrations/calendar/events/confirm")
def confirm_calendar_event(body: ConfirmCalendarEventRequest) -> dict[str, Any]:
    """Create a calendar event after explicit user confirmation."""
    _require_calendar_service()
    response = get_calendar_service().execute_confirmed(body)
    return response.model_dump(exclude_none=True)


@router.post("/integrations/calendar/events/propose-delete")
def propose_calendar_delete(body: ProposeCalendarDeleteRequest) -> dict[str, Any]:
    """Match events and return needs_scope / needs_confirmation before delete."""
    _require_calendar_service()
    response = get_calendar_service().propose_delete(body)
    return response.model_dump(exclude_none=True)


@router.post("/integrations/calendar/events/confirm-delete")
def confirm_calendar_delete(body: ConfirmCalendarDeleteRequest) -> dict[str, Any]:
    """Execute a pending delete after scope or yes/no confirmation."""
    _require_calendar_service()
    response = get_calendar_service().confirm_delete(body)
    return response.model_dump(exclude_none=True)


@router.post("/integrations/calendar/events/bulk-delete")
def bulk_delete_calendar_events(body: BulkDeleteCalendarEventsRequest) -> dict[str, Any]:
    """Delete multiple calendar events by id."""
    _require_calendar_service()
    return get_calendar_service().bulk_delete(body)


@router.post("/integrations/calendar/events")
def create_calendar_event(body: CreateCalendarEventRequest) -> dict[str, Any]:
    """
    Create a calendar event on the user's connected account.

    Direct create (no recap) — used when the client already collected confirmation.
    """
    _require_calendar_service()
    tool_name = _tool_name_for_provider(body.provider)
    confirm_body = ConfirmCalendarEventRequest(
        tool_name=tool_name,
        summary=body.summary.strip(),
        start=body.start.strip(),
        end=body.end.strip(),
        source_text=body.summary.strip(),
        title_field="subject" if tool_name == "microsoft_graph" else "summary",
        args={
            "operation": "create_calendar_event",
            "summary": body.summary.strip(),
            "subject": body.summary.strip(),
            "start": body.start.strip(),
            "end": body.end.strip(),
            **({"description": body.description.strip()} if body.description else {}),
            **({"body": body.description.strip()} if body.description else {}),
            **({"location": body.location.strip()} if body.location else {}),
        },
    )
    response = get_calendar_service().execute_confirmed(confirm_body)
    if response.ok and response.data:
        return {"ok": True, "data": response.data}
    return {"ok": False, "error": response.error or "create failed"}
