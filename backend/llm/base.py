"""
Provider-neutral contracts for streaming chat with tool-calling.

Every chat provider (Gemini, OpenAI, Anthropic, OpenAI-compatible custom, Ollama)
implements the same ``ChatProvider`` protocol and yields the same normalized
``ProviderEvent`` stream, so the tool-calling loop in ``chat_loop.py`` never needs
to know which vendor is behind a request.

Normalized message shapes (a plain list of dicts) understood by every provider:

    {"role": "system", "content": "..."}
    {"role": "user", "content": "..."}
    {"role": "assistant", "content": "..."}
    {"role": "assistant", "tool_calls": [ToolCall, ...]}   # model asked for tools
    {"role": "tool", "tool_call_id": "...", "name": "...", "content": "..."}  # tool result

A message ``content`` is normally a plain string. For multimodal input it may instead
be a list of *content parts*, each one of:

    {"type": "text", "text": "..."}
    {"type": "image", "mime_type": "image/jpeg", "data": "<base64>"}

Build parts with ``text_part`` / ``image_part`` and let each provider render them in
its own wire format (see ``iter_parts`` / ``part_image_bytes``).
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Iterator, Protocol, runtime_checkable


@dataclass(frozen=True)
class ToolCall:
    """A single tool/function call requested by the model."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass(frozen=True)
class TextDelta:
    """A streamed chunk of assistant text."""

    text: str


@dataclass(frozen=True)
class ToolCallRequest:
    """The model finished a turn by requesting one or more tool calls."""

    calls: list[ToolCall]


@dataclass(frozen=True)
class StreamError:
    """A terminal error for the current turn."""

    message: str


# A provider yields a sequence of these for a single model turn.
ProviderEvent = TextDelta | ToolCallRequest | StreamError

# Tool specs are provider-neutral JSON-Schema descriptions (see tool_registry.build_tool_specs).
ToolSpec = dict[str, Any]
Message = dict[str, Any]


@runtime_checkable
class ChatProvider(Protocol):
    """A streaming chat backend for one vendor."""

    id: str
    supports_tools: bool

    def stream(
        self,
        messages: list[Message],
        model: str,
        *,
        tools: list[ToolSpec] | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> Iterator[ProviderEvent]:
        """
        Run ONE model turn and yield normalized events.

        Yields ``TextDelta`` for streamed text, at most one ``ToolCallRequest`` when
        the model wants to call tools, and ``StreamError`` on failure. The generator
        ending without a ``ToolCallRequest`` means the turn produced a final answer.
        """
        ...


def text_part(text: str) -> dict[str, Any]:
    """A text content part."""
    return {"type": "text", "text": str(text or "")}


def image_part(data: bytes | str, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """An image content part. ``data`` may be raw bytes or an existing base64 string."""
    if isinstance(data, (bytes, bytearray)):
        encoded = base64.b64encode(bytes(data)).decode("ascii")
    else:
        encoded = str(data)
    return {"type": "image", "mime_type": mime_type, "data": encoded}


def iter_parts(content: Any) -> list[dict[str, Any]]:
    """Normalize a message ``content`` into a list of content parts.

    A plain string becomes a single text part; an existing parts list is returned
    as-is. This lets providers handle text-only and multimodal messages uniformly.
    """
    if isinstance(content, list):
        return [p for p in content if isinstance(p, dict)]
    text = str(content or "")
    return [text_part(text)] if text else []


def is_multimodal(content: Any) -> bool:
    """True if ``content`` is a parts list (vs. a plain string)."""
    return isinstance(content, list)


def part_image_bytes(part: dict[str, Any]) -> bytes:
    """Decode an image part's base64 ``data`` back to raw bytes."""
    return base64.b64decode(part.get("data") or "")


def split_system(messages: list[Message]) -> tuple[str, list[Message]]:
    """
    Split a normalized message list into a single system string and the remaining turns.

    Providers that take the system prompt as a dedicated field (Anthropic, Gemini)
    use this; OpenAI-style providers keep system messages inline instead.
    """
    system_parts: list[str] = []
    rest: list[Message] = []
    for message in messages:
        if message.get("role") == "system":
            content = str(message.get("content") or "").strip()
            if content:
                system_parts.append(content)
        else:
            rest.append(message)
    return "\n\n".join(system_parts), rest
