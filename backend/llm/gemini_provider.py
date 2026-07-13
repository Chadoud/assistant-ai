"""
Google Gemini streaming provider with function calling.

Wraps ``google.genai`` ``generate_content_stream``. Function calls are surfaced as
``ToolCallRequest`` and tool results are fed back as ``function_response`` parts, so
Gemini gains the same tool-calling parity as the other providers on the text path.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Iterator

from .base import (
    Message,
    ProviderEvent,
    StreamError,
    TextDelta,
    ToolCall,
    ToolCallRequest,
    ToolSpec,
    iter_parts,
    part_image_bytes,
    split_system,
)

logger = logging.getLogger(__name__)

GEMINI_CHAT_MODEL_DEFAULT = "gemini-2.5-flash"


def _build_contents(messages: list[Message], genai_types: Any) -> list[Any]:
    contents: list[Any] = []
    for message in messages:
        role = message.get("role")
        if role == "tool":
            response_obj = _coerce_tool_response(message.get("content"))
            contents.append(
                genai_types.Content(
                    role="tool",
                    parts=[
                        genai_types.Part.from_function_response(
                            name=str(message.get("name") or "tool"),
                            response=response_obj,
                        )
                    ],
                )
            )
        elif role == "assistant" and message.get("tool_calls"):
            calls: list[ToolCall] = message["tool_calls"]
            parts = [
                genai_types.Part(
                    function_call=genai_types.FunctionCall(name=call.name, args=call.arguments)
                )
                for call in calls
            ]
            contents.append(genai_types.Content(role="model", parts=parts))
        elif role == "assistant":
            contents.append(
                genai_types.Content(role="model", parts=[genai_types.Part(text=str(message.get("content") or ""))])
            )
        elif role == "user":
            contents.append(
                genai_types.Content(role="user", parts=_user_parts(message.get("content"), genai_types))
            )
    return contents


def _user_parts(content: Any, genai_types: Any) -> list[Any]:
    """Map a user message's content (text or multimodal parts) to Gemini parts."""
    parts: list[Any] = []
    for part in iter_parts(content):
        if part.get("type") == "image":
            parts.append(
                genai_types.Part.from_bytes(
                    data=part_image_bytes(part), mime_type=part.get("mime_type") or "image/jpeg"
                )
            )
        else:
            parts.append(genai_types.Part(text=str(part.get("text") or "")))
    return parts or [genai_types.Part(text="")]


def _coerce_tool_response(content: Any) -> dict[str, Any]:
    """Gemini wants the function response as a JSON object."""
    if isinstance(content, dict):
        return content
    text = str(content or "")
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {"result": parsed}
    except json.JSONDecodeError:
        return {"result": text}


class GeminiProvider:
    """Streaming chat via Google Gemini."""

    id = "gemini"
    supports_tools = True

    def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        tools: list[ToolSpec] | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> Iterator[ProviderEvent]:
        key = (api_key or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
        if not key:
            yield StreamError(
                "GEMINI_API_KEY not configured. Add it in Settings -> AI Provider or to backend/.env."
            )
            return

        try:
            from google import genai  # type: ignore[import]
            from google.genai import types as genai_types  # type: ignore[import]
        except ImportError:
            yield StreamError("google-genai package not installed. Run: pip install google-genai>=1.0")
            return

        model_name = (model or os.environ.get("GEMINI_CHAT_MODEL", "").strip() or GEMINI_CHAT_MODEL_DEFAULT)
        system, rest = split_system(messages)

        config_kwargs: dict[str, Any] = {}
        if system:
            config_kwargs["system_instruction"] = system
        if tools:
            config_kwargs["tools"] = [
                genai_types.Tool(
                    function_declarations=[
                        genai_types.FunctionDeclaration(
                            name=spec["name"],
                            description=spec.get("description", ""),
                            parameters_json_schema=spec.get("parameters") or {"type": "object", "properties": {}},
                        )
                        for spec in tools
                    ]
                )
            ]

        client = genai.Client(api_key=key)
        calls: list[ToolCall] = []
        try:
            for chunk in client.models.generate_content_stream(
                model=model_name,
                contents=_build_contents(rest, genai_types),
                config=genai_types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
            ):
                text = getattr(chunk, "text", None) or ""
                if text:
                    yield TextDelta(text=text)
                calls.extend(_extract_calls(chunk))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini chat stream failed model=%s: %s", model_name, exc)
            _notify_quota(str(exc))
            yield StreamError(str(exc))
            return

        if calls:
            yield ToolCallRequest(calls=calls)


def _notify_quota(error: str) -> None:
    """Surface a free-tier cap to the live UI (best-effort, never raises)."""
    try:
        from orchestrator.quota_notice import maybe_emit_quota_notice

        maybe_emit_quota_notice(error, provider="gemini")
    except Exception:  # noqa: BLE001 — notification must never break the stream path
        logger.debug("quota notice emit failed", exc_info=True)


def _extract_calls(chunk: Any) -> list[ToolCall]:
    """Pull any function_call parts out of a streamed Gemini chunk."""
    out: list[ToolCall] = []
    candidates = getattr(chunk, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or [] if content else []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None):
                args = getattr(fc, "args", None)
                out.append(
                    ToolCall(
                        id=str(getattr(fc, "id", None) or uuid.uuid4().hex),
                        name=str(fc.name),
                        arguments=dict(args) if isinstance(args, dict) else (dict(args or {})),
                    )
                )
    return out
