"""
OpenAI Chat Completions streaming provider.

Because the request accepts a ``base_url``, this same implementation also powers the
generic "Custom (OpenAI-compatible)" provider — any endpoint that speaks the
``/chat/completions`` protocol (OpenRouter, Groq, Together, LM Studio, vLLM, or
Ollama's own OpenAI-compatible port).
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

import httpx

from .base import (
    Message,
    ProviderEvent,
    StreamError,
    TextDelta,
    ToolCall,
    ToolCallRequest,
    ToolSpec,
    is_multimodal,
    iter_parts,
)

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_REQUEST_TIMEOUT_S = 120.0


def _to_openai_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Convert normalized messages to the OpenAI Chat Completions wire format."""
    out: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role", "user")
        if role == "tool":
            out.append({
                "role": "tool",
                "tool_call_id": message.get("tool_call_id", ""),
                "content": str(message.get("content") or ""),
            })
        elif role == "assistant" and message.get("tool_calls"):
            calls: list[ToolCall] = message["tool_calls"]
            out.append({
                "role": "assistant",
                "content": str(message.get("content") or "") or None,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                    }
                    for call in calls
                ],
            })
        else:
            out.append({"role": role, "content": _openai_content(message.get("content"))})
    return out


def _openai_content(content: Any) -> Any:
    """Return OpenAI content: a plain string, or a multimodal content-part array."""
    if not is_multimodal(content):
        return str(content or "")
    blocks: list[dict[str, Any]] = []
    for part in iter_parts(content):
        if part.get("type") == "image":
            mime = part.get("mime_type") or "image/jpeg"
            blocks.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{part.get('data') or ''}"},
            })
        else:
            blocks.append({"type": "text", "text": str(part.get("text") or "")})
    return blocks


def _to_openai_tools(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": spec["name"],
                "description": spec.get("description", ""),
                "parameters": spec.get("parameters") or {"type": "object", "properties": {}},
            },
        }
        for spec in tools
    ]


class _PartialToolCall:
    """Accumulates a streamed tool call whose name/arguments arrive in fragments."""

    def __init__(self) -> None:
        self.id = ""
        self.name = ""
        self.arguments = ""

    def finalize(self) -> ToolCall | None:
        if not self.name:
            return None
        try:
            args = json.loads(self.arguments) if self.arguments.strip() else {}
        except json.JSONDecodeError:
            args = {}
        return ToolCall(id=self.id or self.name, name=self.name, arguments=args if isinstance(args, dict) else {})


class OpenAIProvider:
    """Streaming chat via the OpenAI Chat Completions API (and compatible servers)."""

    supports_tools = True

    def __init__(self, provider_id: str = "openai") -> None:
        self.id = provider_id

    def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        tools: list[ToolSpec] | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> Iterator[ProviderEvent]:
        key = (api_key or "").strip()
        if not key:
            yield StreamError(f"No API key configured for {self.id}. Add it in Settings -> AI Provider.")
            return

        root = (base_url or _DEFAULT_BASE_URL).strip().rstrip("/")
        payload: dict[str, Any] = {
            "model": model,
            "messages": _to_openai_messages(messages),
            "stream": True,
        }
        if tools:
            payload["tools"] = _to_openai_tools(tools)

        partials: dict[int, _PartialToolCall] = {}
        try:
            with httpx.Client(timeout=_REQUEST_TIMEOUT_S) as client:
                with client.stream(
                    "POST",
                    f"{root}/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    content=json.dumps(payload),
                ) as response:
                    if response.status_code >= 400:
                        body = response.read().decode("utf-8", "replace")
                        yield StreamError(_format_http_error(self.id, response.status_code, body))
                        return
                    for line in response.iter_lines():
                        for event in _consume_sse_line(line, partials):
                            yield event
        except httpx.HTTPError as exc:
            logger.warning("%s chat stream failed: %s", self.id, exc)
            yield StreamError(f"{self.id} request failed: {exc}")
            return

        finalized = [pc.finalize() for pc in partials.values()]
        calls = [c for c in finalized if c is not None]
        if calls:
            yield ToolCallRequest(calls=calls)


def _consume_sse_line(line: str, partials: dict[int, _PartialToolCall]) -> Iterator[ProviderEvent]:
    if not line or not line.startswith("data:"):
        return
    data = line[len("data:"):].strip()
    if not data or data == "[DONE]":
        return
    try:
        chunk = json.loads(data)
    except json.JSONDecodeError:
        return
    choices = chunk.get("choices") or []
    if not choices:
        return
    delta = choices[0].get("delta") or {}

    text = delta.get("content")
    if text:
        yield TextDelta(text=str(text))

    for tc in delta.get("tool_calls") or []:
        index = int(tc.get("index", 0))
        partial = partials.setdefault(index, _PartialToolCall())
        if tc.get("id"):
            partial.id = tc["id"]
        fn = tc.get("function") or {}
        if fn.get("name"):
            partial.name = fn["name"]
        if fn.get("arguments"):
            partial.arguments += fn["arguments"]


def _format_http_error(provider_id: str, status: int, body: str) -> str:
    detail = body.strip()
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict) and err.get("message"):
                detail = str(err["message"])
            elif isinstance(err, str):
                detail = err
    except json.JSONDecodeError:
        pass
    return f"{provider_id} API error ({status}): {detail[:400]}"
