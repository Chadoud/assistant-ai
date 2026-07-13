"""
Local Ollama streaming provider.

Streams text via the ``ollama`` package and surfaces native tool calls when the
running model supports them. Models without tool support simply never emit tool
calls, degrading gracefully to plain chat.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Iterator

import ollama

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


def _to_ollama_messages(messages: list[Message]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role", "user")
        if role == "tool":
            out.append({"role": "tool", "content": str(message.get("content") or "")})
        elif role == "assistant" and message.get("tool_calls"):
            calls: list[ToolCall] = message["tool_calls"]
            out.append({
                "role": "assistant",
                "content": str(message.get("content") or ""),
                "tool_calls": [
                    {"function": {"name": call.name, "arguments": call.arguments}} for call in calls
                ],
            })
        else:
            content = message.get("content")
            if is_multimodal(content):
                out.append(_ollama_multimodal_message(role, content))
            else:
                out.append({"role": role, "content": str(content or "")})
    return out


def _ollama_multimodal_message(role: str, content: Any) -> dict[str, Any]:
    """Map a multimodal message to Ollama's ``content`` + base64 ``images`` shape.

    Only multimodal local models can use the images; text-only models simply ignore
    the field, so this degrades gracefully.
    """
    texts: list[str] = []
    images: list[str] = []
    for part in iter_parts(content):
        if part.get("type") == "image":
            if part.get("data"):
                images.append(str(part["data"]))
        else:
            texts.append(str(part.get("text") or ""))
    message: dict[str, Any] = {"role": role, "content": "\n".join(t for t in texts if t)}
    if images:
        message["images"] = images
    return message


def _to_ollama_tools(tools: list[ToolSpec]) -> list[dict[str, Any]]:
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


def _extract_calls(chunk: Any) -> list[ToolCall]:
    message = chunk.get("message") if isinstance(chunk, dict) else getattr(chunk, "message", None)
    raw_calls = (
        message.get("tool_calls")
        if isinstance(message, dict)
        else getattr(message, "tool_calls", None)
    ) or []
    out: list[ToolCall] = []
    for call in raw_calls:
        fn = call.get("function") if isinstance(call, dict) else getattr(call, "function", None)
        if not fn:
            continue
        name = fn.get("name") if isinstance(fn, dict) else getattr(fn, "name", None)
        args = fn.get("arguments") if isinstance(fn, dict) else getattr(fn, "arguments", None)
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        if name:
            out.append(ToolCall(id=uuid.uuid4().hex, name=str(name), arguments=args if isinstance(args, dict) else {}))
    return out


def _chunk_text(chunk: Any) -> str:
    message = chunk.get("message") if isinstance(chunk, dict) else getattr(chunk, "message", None)
    if isinstance(message, dict):
        return str(message.get("content") or "")
    return str(getattr(message, "content", "") or "") if message is not None else ""


class OllamaProvider:
    """Streaming chat via a local Ollama daemon."""

    id = "ollama"
    supports_tools = True

    @staticmethod
    def _chat(messages: list[dict[str, Any]], model: str, tools: list[dict[str, Any]] | None) -> Any:
        kwargs: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        return ollama.chat(**kwargs)

    def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        tools: list[ToolSpec] | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> Iterator[ProviderEvent]:
        wire_messages = _to_ollama_messages(messages)
        ollama_tools = _to_ollama_tools(tools) if tools else None

        calls: list[ToolCall] = []
        started = False
        try:
            for chunk in self._chat(wire_messages, model, ollama_tools):
                started = True
                text = _chunk_text(chunk)
                if text:
                    yield TextDelta(text=text)
                calls.extend(_extract_calls(chunk))
        except Exception as exc:  # noqa: BLE001
            # Many local models reject the `tools` argument. If nothing has streamed yet,
            # retry once as a plain chat so tool-incapable models still work.
            if ollama_tools and not started:
                logger.info("Ollama model=%s rejected tools; retrying without tools", model)
                try:
                    for chunk in self._chat(wire_messages, model, None):
                        text = _chunk_text(chunk)
                        if text:
                            yield TextDelta(text=text)
                except Exception as retry_exc:  # noqa: BLE001
                    logger.warning("Ollama chat stream failed model=%s: %s", model, retry_exc)
                    yield StreamError(str(retry_exc))
                    return
            else:
                logger.warning("Ollama chat stream failed model=%s: %s", model, exc)
                yield StreamError(str(exc))
                return

        if calls:
            yield ToolCallRequest(calls=calls)
