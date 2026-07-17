"""
Assistant helper endpoints — Gmail preview and streaming multi-provider AI chat.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from gmail_api_client import gmail_get_message, gmail_list_messages
from orchestrator import Capability, candidates_for
from orchestrator.chat import stream_chat_with_relay
from routes.ai_credentials import resolve_provider_credentials
from services.assistant import handle_assistant_turn, turn_result_to_json, unified_turn_enabled
from tool_registry import build_tool_specs

logger = logging.getLogger(__name__)


class GmailSearchPreviewBody(BaseModel):
    query: str = Field("", max_length=500)
    max_messages: int = Field(20, ge=1, le=50)


class AssistantChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    # Plain string or multimodal parts list ``[{type, text|data, ...}]`` (see llm.base.iter_parts).
    content: Any = Field(...)


class AssistantChatBody(BaseModel):
    model: str = Field(..., min_length=1, max_length=200)
    messages: list[AssistantChatMessage] = Field(..., min_length=1, max_length=100)
    provider: str = Field(default="ollama", max_length=50)
    api_key: str | None = Field(default=None, max_length=2048)
    base_url: str | None = Field(default=None, max_length=512)
    use_web_search: bool = Field(default=False)
    enable_tools: bool = Field(default=True)
    autonomous_mode: bool = Field(default=False)
    allow_sensitive: bool | None = Field(default=None)


class AssistantTurnBody(BaseModel):
    """One user message routed through server-side intent and prefetch."""

    message: str = Field(..., min_length=1, max_length=8000)
    previous_user_message: str | None = Field(default=None, max_length=8000)
    pending_calendar_draft: dict[str, Any] | None = None
    pending_calendar_delete_draft: dict[str, Any] | None = None
    memory_block: str = Field(default="", max_length=32_000)
    conversation_summary: str | None = Field(default=None, max_length=16_000)
    assistant_tools_enabled: bool = True
    assistant_agent_enabled: bool = True
    messages_for_stream: list[AssistantChatMessage] | None = None
    # Stream continuation fields (when mode=stream)
    model: str | None = Field(default=None, max_length=200)
    provider: str | None = Field(default=None, max_length=50)
    api_key: str | None = Field(default=None, max_length=2048)
    base_url: str | None = Field(default=None, max_length=512)
    use_web_search: bool = False
    enable_tools: bool = True
    autonomous_mode: bool = False
    allow_sensitive: bool | None = None


class ExtractAttachmentBody(BaseModel):
    """Extract text from a dialog-granted local file for composer chat attach."""

    path: str = Field(..., min_length=1, max_length=4096)


def create_assistant_router() -> APIRouter:
    router = APIRouter(prefix="/assistant", tags=["assistant"])

    @router.post("/gmail-search")
    def gmail_search_preview(body: GmailSearchPreviewBody) -> dict[str, Any]:
        from gmail_google_oauth import get_valid_access_token

        try:
            token = get_valid_access_token()
        except Exception as exc:
            logger.warning("gmail_search_preview: could not obtain access token: %s", exc)
            raise HTTPException(status_code=401, detail="gmail_not_configured") from exc

        # Fetch more than the cap to account for messages we'll discard after label inspection.
        cap = int(body.max_messages)
        fetch_limit = min(cap * 3, 50)
        list_resp = gmail_list_messages(
            token,
            query=str(body.query or ""),
            max_results=fetch_limit,
            get_token=get_valid_access_token,
        )
        stubs: list[dict[str, str]] = list(list_resp.get("messages") or [])
        out: list[dict[str, Any]] = []
        for stub in stubs:
            if len(out) >= cap:
                break
            mid = str(stub.get("id") or "").strip()
            if not mid:
                continue
            # format="full" is not needed — "metadata" returns labelIds as a top-level field
            # alongside the payload.headers array we already use.
            meta = gmail_get_message(
                token,
                mid,
                message_format="metadata",
                metadata_headers=["From", "Subject", "Date"],
                get_token=get_valid_access_token,
            )

            # ── Label-based pre-filter ─────────────────────────────────────────
            label_ids: list[str] = meta.get("labelIds") or []
            # Drop what Gmail itself has already classified as noise.
            # CATEGORY_PROMOTIONS, CATEGORY_SOCIAL, CATEGORY_UPDATES, CATEGORY_FORUMS
            # are the labels Gmail assigns to the tabbed-inbox categories.
            noise_labels = {
                "CATEGORY_PROMOTIONS",
                "CATEGORY_SOCIAL",
                "CATEGORY_FORUMS",
                "CATEGORY_UPDATES",
                "SPAM",
            }
            if noise_labels.intersection(label_ids):
                continue

            is_read = "UNREAD" not in label_ids
            # Gmail marks messages it considers important (based on your behaviour) with IMPORTANT.
            # STARRED means the user has manually flagged it — always surface those.
            is_important = "IMPORTANT" in label_ids or "STARRED" in label_ids

            # ── Header extraction ──────────────────────────────────────────────
            payload = meta.get("payload")
            headers = payload.get("headers") if isinstance(payload, dict) else []
            hmap: dict[str, str] = {}
            if isinstance(headers, list):
                for h in headers:
                    if isinstance(h, dict) and h.get("name") and h.get("value"):
                        hmap[str(h["name"]).lower()] = str(h["value"])
            subject = (hmap.get("subject") or "").strip()[:500]
            from_addr = (hmap.get("from") or "").strip()[:500]
            date_hdr = (hmap.get("date") or "").strip()[:200]

            # Fallbacks when headers are missing.
            snippet = str(meta.get("snippet") or "").strip()
            if not subject and snippet:
                subject = snippet[:500]
            if not date_hdr:
                raw_internal = meta.get("internalDate")
                if isinstance(raw_internal, (int, float)):
                    ms = int(raw_internal)
                elif isinstance(raw_internal, str) and raw_internal.isdigit():
                    ms = int(raw_internal)
                else:
                    ms = 0
                if ms > 0:
                    date_hdr = (
                        datetime.fromtimestamp(ms / 1000.0, tz=UTC)
                        .strftime("%Y-%m-%d %H:%M UTC")[:200]
                    )

            out.append(
                {
                    "id": mid,
                    "subject": subject,
                    "from": from_addr,
                    "snippet": snippet[:500],
                    "date": date_hdr,
                    "isRead": is_read,
                    "isImportant": is_important,
                }
            )
        return {"ok": True, "messages": out}

    @router.post("/extract-attachment")
    def extract_attachment(body: ExtractAttachmentBody) -> dict[str, Any]:
        """Extract document text for composer attach (PDF/Office/text; no video)."""
        from composer_attachment_extract import extract_attachment_for_chat

        return extract_attachment_for_chat(body.path)

    @router.post("/turn", response_model=None)
    def assistant_turn(body: AssistantTurnBody) -> dict[str, Any] | StreamingResponse:
        """
        Route one assistant message through server intent and prefetch.

        Returns JSON for completed turns (calendar, delete, actions) or SSE when
        the handler delegates to the standard chat stream.
        """
        if not unified_turn_enabled():
            raise HTTPException(status_code=404, detail="assistant_unified_turn_disabled")

        stream_messages = None
        if body.messages_for_stream:
            stream_messages = [
                {"role": m.role, "content": m.content}
                for m in body.messages_for_stream
            ]

        result = handle_assistant_turn(
            message=body.message,
            previous_user_message=body.previous_user_message,
            pending_calendar_draft=body.pending_calendar_draft,
            pending_calendar_delete_draft=body.pending_calendar_delete_draft,
            memory_block=body.memory_block,
            conversation_summary=body.conversation_summary,
            assistant_tools_enabled=body.assistant_tools_enabled,
            assistant_agent_enabled=body.assistant_agent_enabled,
            messages_for_stream=stream_messages,
        )

        if result.mode != "stream":
            return turn_result_to_json(result)

        if not body.model or not body.messages_for_stream:
            raise HTTPException(
                status_code=400,
                detail="messages_for_stream and model required for stream mode",
            )

        request_messages: list[dict[str, Any]] = []
        if result.stream_system_prompt:
            request_messages.append({"role": "system", "content": result.stream_system_prompt})
        request_messages.extend(
            {"role": m.role, "content": m.content} for m in body.messages_for_stream
        )

        api_key, base_url = resolve_provider_credentials(
            body.provider or "ollama",
            body.api_key,
            body.base_url,
        )
        tools = build_tool_specs() if body.enable_tools else None
        candidates = candidates_for(
            Capability.CHAT,
            preferred=body.provider or "ollama",
            preferred_model=body.model,
            preferred_api_key=api_key,
            preferred_base_url=base_url,
            require_tools=bool(tools),
        )

        def generate():
            allow_sensitive = (
                body.allow_sensitive
                if body.allow_sensitive is not None
                else body.autonomous_mode
            )
            for payload in stream_chat_with_relay(
                candidates, request_messages, tools=tools, allow_sensitive=allow_sensitive
            ):
                yield f"data: {payload}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    @router.post("/chat")
    def assistant_chat_stream(body: AssistantChatBody) -> StreamingResponse:
        """
        Stream AI chat completions as Server-Sent Events for any configured provider.

        Routes through the provider-agnostic tool-calling loop (Gemini, OpenAI,
        Anthropic, custom OpenAI-compatible, or local Ollama).

        Text events:  ``data: {"delta": "..."}``
        Tool events:  ``data: {"tool_call": {"name": "..."}}`` / ``{"tool_result": {...}}``
        Final event:  ``data: {"done": true, "full": "..."}``
        Error event:  ``data: {"error": "..."}``
        """
        # Pass messages through as-is; the client-side system prompt already
        # contains the memory block via buildDefaultSystemPrompt(memoryBlock).
        request_messages: list[dict[str, Any]] = [
            {"role": m.role, "content": m.content} for m in body.messages
        ]

        api_key, base_url = resolve_provider_credentials(body.provider, body.api_key, body.base_url)
        tools = build_tool_specs() if body.enable_tools else None

        # Route through the Conductor: the user's chosen provider is tried first, then
        # the capability chain relays automatically on quota/transient failure.
        candidates = candidates_for(
            Capability.CHAT,
            preferred=body.provider,
            preferred_model=body.model,
            preferred_api_key=api_key,
            preferred_base_url=base_url,
            require_tools=bool(tools),
        )

        def generate():
            allow_sensitive = (
                body.allow_sensitive
                if body.allow_sensitive is not None
                else body.autonomous_mode
            )
            for payload in stream_chat_with_relay(
                candidates, request_messages, tools=tools, allow_sensitive=allow_sensitive
            ):
                yield f"data: {payload}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    return router
