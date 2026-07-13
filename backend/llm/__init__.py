"""Provider-agnostic LLM chat layer (text chat + tool-calling)."""

from __future__ import annotations

from .base import ChatProvider, Message, ToolCall, ToolSpec
from .chat_loop import MAX_TOOL_ITERATIONS, stream_chat_completion
from .registry import PROVIDERS, ProviderMeta, get_provider, provider_meta

__all__ = [
    "ChatProvider",
    "Message",
    "ToolCall",
    "ToolSpec",
    "MAX_TOOL_ITERATIONS",
    "stream_chat_completion",
    "PROVIDERS",
    "ProviderMeta",
    "get_provider",
    "provider_meta",
]
