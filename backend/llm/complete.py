"""
One-shot, non-streaming LLM completion for backend-initiated jobs.

Chat and voice flows stream through ``chat_loop`` with a provider/model chosen by
the client. Background jobs (memory/task extraction, summaries, digests) have no
client in the loop, so this module resolves a ready provider on its own and
collects a single completion to a plain string.

Resolution is **cloud-first** (matching the product decision): the first cloud
provider with a configured key wins, falling back to local Ollama only when no
cloud key is present. Returns ``None`` when nothing is usable so callers can
degrade gracefully instead of raising.
"""

from __future__ import annotations

import logging
import os

from .base import StreamError, TextDelta, ToolCallRequest
from .registry import PROVIDERS, get_provider, provider_meta

logger = logging.getLogger(__name__)

# Cloud providers are tried in this order before falling back to local Ollama.
_CLOUD_PREFERENCE = ("gemini", "openai", "anthropic", "custom")


def pick_ready_provider() -> tuple[str, str] | None:
    """Return ``(provider_id, model)`` for the first usable provider, or None.

    A cloud provider is "ready" when its API key env var is set. Ollama is only
    chosen when ``OLLAMA_DEFAULT_MODEL`` names a model, since we cannot guess an
    installed local model reliably here.
    """
    for pid in _CLOUD_PREFERENCE:
        meta = provider_meta(pid)
        if meta.needs_key and not os.environ.get(meta.env_key or "", "").strip():
            continue
        if meta.needs_base_url and not os.environ.get(meta.env_base_url or "", "").strip():
            continue
        model = meta.default_models[0] if meta.default_models else ""
        if pid == "custom":
            model = os.environ.get("CUSTOM_DEFAULT_MODEL", "").strip() or model
        if model:
            return pid, model

    local_model = os.environ.get("OLLAMA_DEFAULT_MODEL", "").strip()
    if local_model:
        return "ollama", local_model
    return None


def complete(
    system: str,
    user: str,
    *,
    provider_id: str | None = None,
    model: str | None = None,
    max_chars: int = 16000,
) -> str | None:
    """Run a single completion and return the collected text (or None on failure).

    When ``provider_id``/``model`` are omitted they are resolved via
    :func:`pick_ready_provider`. The system + user strings are sent as a normal
    two-turn conversation with no tools.
    """
    if provider_id and model:
        resolved: tuple[str, str] | None = (provider_id, model)
    else:
        resolved = pick_ready_provider()
    if not resolved:
        logger.info("[llm.complete] no ready provider; skipping completion")
        return None

    pid, mdl = resolved
    meta = PROVIDERS.get(pid)
    api_key = os.environ.get(meta.env_key or "", "").strip() if meta and meta.env_key else None
    base_url = os.environ.get(meta.env_base_url or "", "").strip() if meta and meta.env_base_url else None

    messages = [
        {"role": "system", "content": system.strip()},
        {"role": "user", "content": user.strip()[:max_chars]},
    ]

    chunks: list[str] = []
    try:
        provider = get_provider(pid)
        for event in provider.stream(
            messages,
            mdl,
            tools=None,
            api_key=api_key,
            base_url=base_url,
        ):
            if isinstance(event, TextDelta):
                chunks.append(event.text)
            elif isinstance(event, ToolCallRequest):
                continue  # extraction prompts never request tools
            elif isinstance(event, StreamError):
                logger.warning("[llm.complete] provider %s error: %s", pid, event.message)
                return None
    except Exception:
        logger.exception("[llm.complete] provider %s failed", pid)
        return None

    text = "".join(chunks).strip()
    return text or None
