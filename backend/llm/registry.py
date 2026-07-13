"""
Provider registry — maps a provider id to a ``ChatProvider`` plus UI metadata.

``PROVIDERS`` is the single source of truth for which assistants exist, what they
need to be configured (key, base URL), and the model presets the Settings UI shows.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .anthropic_provider import AnthropicProvider
from .base import ChatProvider
from .gemini_provider import GeminiProvider
from .ollama_provider import OllamaProvider
from .openai_provider import OpenAIProvider


@dataclass(frozen=True)
class ProviderMeta:
    """Static description of a provider for the configuration UI and routing."""

    id: str
    label: str
    needs_key: bool
    needs_base_url: bool
    supports_tools: bool
    supports_vision: bool = False
    is_local: bool = False
    default_models: list[str] = field(default_factory=list)
    env_key: str | None = None
    env_base_url: str | None = None


PROVIDERS: dict[str, ProviderMeta] = {
    "ollama": ProviderMeta(
        id="ollama",
        label="Ollama (local)",
        needs_key=False,
        needs_base_url=False,
        supports_tools=True,
        supports_vision=True,
        is_local=True,
        default_models=[],
    ),
    "gemini": ProviderMeta(
        id="gemini",
        label="Google Gemini",
        needs_key=True,
        needs_base_url=False,
        supports_tools=True,
        supports_vision=True,
        default_models=["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
        env_key="GEMINI_API_KEY",
    ),
    "openai": ProviderMeta(
        id="openai",
        label="OpenAI",
        needs_key=True,
        needs_base_url=False,
        supports_tools=True,
        supports_vision=True,
        default_models=["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
        env_key="OPENAI_API_KEY",
    ),
    "anthropic": ProviderMeta(
        id="anthropic",
        label="Anthropic Claude",
        needs_key=True,
        needs_base_url=False,
        supports_tools=True,
        supports_vision=True,
        default_models=[
            "claude-sonnet-5",
            "claude-opus-4-8",
            "claude-haiku-4-5-20251001",
            "claude-fable-5",
            "claude-sonnet-4-6",
            "claude-opus-4-7",
        ],
        env_key="ANTHROPIC_API_KEY",
    ),
    "custom": ProviderMeta(
        id="custom",
        label="Custom (OpenAI-compatible)",
        needs_key=True,
        needs_base_url=True,
        supports_tools=True,
        supports_vision=True,
        default_models=[],
        env_key="CUSTOM_API_KEY",
        env_base_url="CUSTOM_BASE_URL",
    ),
}


def get_provider(provider_id: str) -> ChatProvider:
    """
    Return a ``ChatProvider`` for ``provider_id``.

    Unknown ids fall back to Ollama, matching the legacy default where any non-Gemini
    provider used the local daemon.
    """
    pid = (provider_id or "").strip().lower()
    if pid == "gemini":
        return GeminiProvider()
    if pid == "openai":
        return OpenAIProvider("openai")
    if pid == "anthropic":
        return AnthropicProvider()
    if pid == "custom":
        return OpenAIProvider("custom")
    return OllamaProvider()


def provider_meta(provider_id: str) -> ProviderMeta:
    return PROVIDERS.get((provider_id or "").strip().lower(), PROVIDERS["ollama"])
