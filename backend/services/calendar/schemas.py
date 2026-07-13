"""Pydantic models for calendar create/confirm API responses."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

CalendarStatus = Literal[
    "needs_confirmation",
    "needs_input",
    "created",
    "cancelled",
    "failed",
]
CalendarDeleteStatus = Literal[
    "needs_confirmation",
    "needs_scope",
    "cancelled",
    "deleted",
    "failed",
]
RecurrenceScope = Literal["this_instance", "this_and_following", "all_series"]
CalendarMissingField = Literal["time", "title"]


class CalendarDraftPayload(BaseModel):
    """Serializable pending event shown to the user before create."""

    summary: str
    start: str
    end: str
    tool_name: str = Field(default="google_workspace")


class CalendarCreateResponse(BaseModel):
    """Shared response contract for voice, text chat, and REST."""

    ok: bool = True
    status: CalendarStatus
    recap: str | None = None
    draft: CalendarDraftPayload | None = None
    missing: CalendarMissingField | None = None
    error: str | None = None
    data: dict | None = None


class ProposeCalendarEventRequest(BaseModel):
    """Propose a calendar event from natural language + optional tool args."""

    source_text: str = Field(..., min_length=1, max_length=4000)
    tool_name: str = Field(default="google_workspace", max_length=80)
    operation: str = Field(default="create_calendar_event", max_length=80)
    summary: str | None = Field(default=None, max_length=500)
    start: str | None = Field(default=None, max_length=64)
    end: str | None = Field(default=None, max_length=64)


class ConfirmCalendarEventRequest(BaseModel):
    """Execute or update a pending draft after user confirmation."""

    tool_name: str
    summary: str
    start: str
    end: str
    source_text: str = ""
    title_field: str = "summary"
    args: dict = Field(default_factory=dict)


class BulkDeleteCalendarEventsRequest(BaseModel):
    """Delete multiple events by id on a connected calendar."""

    event_ids: list[str] = Field(..., min_length=1, max_length=100)
    tool_name: str = Field(default="google_workspace", max_length=80)
    calendar_id: str = Field(default="primary", max_length=200)


class SeriesDeleteTargetPayload(BaseModel):
    """One recurring series in a bundled delete draft."""

    event_id: str
    recurring_event_id: str | None = None
    summary: str
    start: str
    end: str


class CalendarDeleteDraftPayload(BaseModel):
    """Serializable pending delete shown to the user before execution."""

    tool_name: str = Field(default="google_workspace")
    calendar_id: str = Field(default="primary")
    event_id: str
    recurring_event_id: str | None = None
    summary: str
    start: str
    end: str
    is_recurring: bool = False
    recurrence_label: str | None = None
    source_text: str = ""
    standalone_event_ids: list[str] = Field(default_factory=list)
    additional_series: list[SeriesDeleteTargetPayload] = Field(default_factory=list)
    awaitingConfirm: bool = True


class CalendarDeleteResponse(BaseModel):
    """Shared delete contract for voice, text chat, and REST."""

    ok: bool = True
    status: CalendarDeleteStatus
    recap: str | None = None
    draft: CalendarDeleteDraftPayload | None = None
    scope_options: list[RecurrenceScope] | None = None
    deleted_count: int | None = None
    error: str | None = None
    data: dict | None = None


class ProposeCalendarDeleteRequest(BaseModel):
    """Propose deleting calendar event(s) from natural language."""

    source_text: str = Field(..., min_length=1, max_length=4000)
    tool_name: str = Field(default="google_workspace", max_length=80)
    calendar_id: str = Field(default="primary", max_length=200)


class ConfirmCalendarDeleteRequest(BaseModel):
    """Execute a pending delete after scope or yes/no confirmation."""

    draft: CalendarDeleteDraftPayload
    scope: RecurrenceScope | None = None
    user_reply: str = ""
