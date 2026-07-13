"""Validated crash report payloads from the renderer."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CrashReportIn(BaseModel):
    """Sanitized client crash; paths must be scrubbed before send."""

    app_version: str = Field(max_length=64)
    environment: str = Field(max_length=32)
    ui_locale: str | None = Field(default=None, max_length=32)
    platform: str | None = Field(default=None, max_length=512)
    source: str = Field(max_length=32, description="sentry_renderer | window_error | unhandledrejection | react_error_boundary | main_process")
    error_message: str = Field(max_length=8000)
    stack_trace: str | None = Field(default=None, max_length=65000)
    instance_id: str | None = Field(default=None, max_length=128)
    session_id: str | None = Field(default=None, max_length=128)
    source_detail: str | None = Field(default=None, max_length=64)
    active_feature: str | None = Field(default=None, max_length=64)
    active_tab: str | None = Field(default=None, max_length=64)
    last_events_json: str | None = Field(default=None, max_length=16384)
    intent_bucket: str | None = Field(default=None, max_length=64)
    tool_name: str | None = Field(default=None, max_length=64)
    llm_provider: str | None = Field(default=None, max_length=32)
    llm_error_class: str | None = Field(default=None, max_length=32)
    conversation_id_hash: str | None = Field(default=None, max_length=64)
    dedupe_key: str | None = Field(default=None, max_length=64)
    sentry_event_id: str | None = Field(default=None, max_length=64)
