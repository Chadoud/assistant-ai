"""
Anthropic Messages API streaming provider.

Anthropic differs from OpenAI in three ways this module normalizes:
  - the system prompt is a top-level field, not a message;
  - tool calls arrive as ``tool_use`` content blocks;
  - tool results are sent back inside a ``user`` message as ``tool_result`` blocks.
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
    split_system,
)

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://api.anthropic.com"
_ANTHROPIC_VERSION = "2023-06-01"
_DEFAULT_MAX_TOKENS = 4096
_REQUEST_TIMEOUT_S = 120.0


def _to_anthropic_messages(messages: list[Message]) -> list[dict[str, Any]]:
    """Convert normalized messages into Anthropic's content-block format."""
    out: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role")
        if role == "tool":
            out.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": message.get("tool_call_id", ""),
                    "content": str(message.get("content") or ""),
                }],
            })
        elif role == "assistant" and message.get("tool_calls"):
            calls: list[ToolCall] = message["tool_calls"]
            blocks: list[dict[str, Any]] = []
            text = str(message.get("content") or "")
            if text:
                blocks.append({"type": "text", "text": text})
            for call in calls:
                blocks.append({
                    "type": "tool_use",
                    "id": call.id,
                    "name": call.name,
                    "input": call.arguments,
                })
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": role, "content": _anthropic_content(message.get("content"))})
    return out


def _anthropic_content(content: Any) -> Any:
    """Return Anthropic content: a plain string, or a list of content blocks."""
    if not is_multimodal(content):
        return str(content or "")
    blocks: list[dict[str, Any]] = []
    for part in iter_parts(content):
        if part.get("type") == "image":
            blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": part.get("mime_type") or "image/jpeg",
                    "data": part.get("data") or "",
                },
            })
        else:
            blocks.append({"type": "text", "text": str(part.get("text") or "")})
    return blocks


def _to_anthropic_tools(tools: list[ToolSpec]) -> list[dict[str, Any]]:
    return [
        {
            "name": spec["name"],
            "description": spec.get("description", ""),
            "input_schema": spec.get("parameters") or {"type": "object", "properties": {}},
        }
        for spec in tools
    ]


class _PartialToolUse:
    """Accumulates a streamed tool_use block (input JSON arrives in fragments)."""

    def __init__(self, block_id: str, name: str) -> None:
        self.id = block_id
        self.name = name
        self.input_json = ""

    def finalize(self) -> ToolCall | None:
        if not self.name:
            return None
        try:
            args = json.loads(self.input_json) if self.input_json.strip() else {}
        except json.JSONDecodeError:
            args = {}
        return ToolCall(id=self.id or self.name, name=self.name, arguments=args if isinstance(args, dict) else {})


class AnthropicProvider:
    """Streaming chat via the Anthropic Messages API."""

    id = "anthropic"
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
        key = (api_key or "").strip()
        if not key:
            yield StreamError("No API key configured for Anthropic. Add it in Settings -> AI Provider.")
            return

        system, rest = split_system(messages)
        root = (base_url or _DEFAULT_BASE_URL).strip().rstrip("/")
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": _DEFAULT_MAX_TOKENS,
            "messages": _to_anthropic_messages(rest),
            "stream": True,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = _to_anthropic_tools(tools)

        partials: dict[int, _PartialToolUse] = {}
        try:
            with httpx.Client(timeout=_REQUEST_TIMEOUT_S) as client:
                with client.stream(
                    "POST",
                    f"{root}/v1/messages",
                    headers={
                        "x-api-key": key,
                        "anthropic-version": _ANTHROPIC_VERSION,
                        "Content-Type": "application/json",
                    },
                    content=json.dumps(payload),
                ) as response:
                    if response.status_code >= 400:
                        body = response.read().decode("utf-8", "replace")
                        yield StreamError(_format_http_error(response.status_code, body))
                        return
                    for line in response.iter_lines():
                        for event in _consume_sse_line(line, partials):
                            yield event
        except httpx.HTTPError as exc:
            logger.warning("Anthropic chat stream failed: %s", exc)
            yield StreamError(f"Anthropic request failed: {exc}")
            return

        finalized = [pu.finalize() for pu in partials.values()]
        calls = [c for c in finalized if c is not None]
        if calls:
            yield ToolCallRequest(calls=calls)


def _consume_sse_line(line: str, partials: dict[int, _PartialToolUse]) -> Iterator[ProviderEvent]:
    if not line or not line.startswith("data:"):
        return
    data = line[len("data:"):].strip()
    if not data:
        return
    try:
        event = json.loads(data)
    except json.JSONDecodeError:
        return

    event_type = event.get("type")
    if event_type == "content_block_start":
        block = event.get("content_block") or {}
        if block.get("type") == "tool_use":
            index = int(event.get("index", 0))
            partials[index] = _PartialToolUse(block_id=str(block.get("id") or ""), name=str(block.get("name") or ""))
    elif event_type == "content_block_delta":
        delta = event.get("delta") or {}
        delta_type = delta.get("type")
        if delta_type == "text_delta" and delta.get("text"):
            yield TextDelta(text=str(delta["text"]))
        elif delta_type == "input_json_delta":
            index = int(event.get("index", 0))
            partial = partials.get(index)
            if partial is not None:
                partial.input_json += str(delta.get("partial_json") or "")


def _format_http_error(status: int, body: str) -> str:
    detail = body.strip()
    try:
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            err = parsed.get("error")
            if isinstance(err, dict) and err.get("message"):
                detail = str(err["message"])
    except json.JSONDecodeError:
        pass
    return f"Anthropic API error ({status}): {detail[:400]}"
