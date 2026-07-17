"""Preferred AI provider context for orchestrator-backed tool calls.

Text chat relays the user's active provider (Settings → AI Provider) so
``plan_and_execute`` plans with the same engine as chat.

Voice is special: Gemini Live handles speech, but heavy ``plan_and_execute``
work prefers Anthropic when ``ANTHROPIC_API_KEY`` is configured so free Gemini
RPM is not burned by planner/critic loops. Gemini then speaks a short summary.

Controlled by ``ASSISTANT_PROVIDER_CONTEXT`` (on by default; set to ``0`` to disable).
"""

from __future__ import annotations

import logging
import os
import threading
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProviderContext:
    """User-selected chat provider credentials for one request or voice session."""

    preferred: str | None = None
    preferred_model: str | None = None
    preferred_api_key: str | None = None
    preferred_base_url: str | None = None


class ProviderContextHolder:
    """Thread-safe mutable holder updated by the voice WebSocket receive loop."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ctx: ProviderContext | None = None

    def update(self, ctx: ProviderContext | None) -> None:
        with self._lock:
            self._ctx = ctx

    def snapshot(self) -> ProviderContext | None:
        with self._lock:
            return self._ctx


_ctx: ContextVar[ProviderContext | None] = ContextVar("provider_context", default=None)

_PUBLIC_KEYS = ("preferred", "preferred_model", "preferred_api_key", "preferred_base_url")
_PRIVATE_KEYS = ("_preferred", "_preferred_model", "_preferred_api_key", "_preferred_base_url")


def provider_context_enabled() -> bool:
    """Return whether provider injection is active (default on)."""
    val = os.environ.get("ASSISTANT_PROVIDER_CONTEXT", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


def set_provider_context(ctx: ProviderContext | None) -> None:
    """Bind provider context for the current async task / thread."""
    _ctx.set(ctx)


def get_provider_context() -> ProviderContext | None:
    """Read provider context for the current async task / thread."""
    return _ctx.get()


def clear_provider_context() -> None:
    """Clear provider context after a chat stream completes."""
    _ctx.set(None)


def provider_context_from_payload(payload: dict[str, Any]) -> ProviderContext | None:
    """Parse a ``provider_relay`` WebSocket frame into a :class:`ProviderContext`."""
    provider = str(payload.get("provider") or "").strip().lower() or None
    model = str(payload.get("model") or "").strip() or None
    api_key = str(payload.get("api_key") or "").strip() or None
    base_url = str(payload.get("base_url") or "").strip() or None
    if not any((provider, model, api_key, base_url)):
        return None
    return ProviderContext(
        preferred=provider,
        preferred_model=model,
        preferred_api_key=api_key,
        preferred_base_url=base_url,
    )


def resolve_preferred_from_parameters(parameters: dict[str, Any]) -> ProviderContext:
    """Read preferred provider fields from tool parameters (public or ``_``-prefixed)."""

    def _pick(public: str, private: str) -> str | None:
        for key in (public, private):
            raw = parameters.get(key)
            if raw is not None and str(raw).strip():
                return str(raw).strip()
        return None

    return ProviderContext(
        preferred=_pick("preferred", "_preferred"),
        preferred_model=_pick("preferred_model", "_preferred_model"),
        preferred_api_key=_pick("preferred_api_key", "_preferred_api_key"),
        preferred_base_url=_pick("preferred_base_url", "_preferred_base_url"),
    )


def merge_provider_context(
    explicit: ProviderContext,
    fallback: ProviderContext | None,
) -> ProviderContext:
    """Prefer explicit tool parameters; fill gaps from session/request context."""
    if fallback is None:
        return explicit

    def _coalesce(field: str) -> str | None:
        return getattr(explicit, field) or getattr(fallback, field)

    return ProviderContext(
        preferred=_coalesce("preferred"),
        preferred_model=_coalesce("preferred_model"),
        preferred_api_key=_coalesce("preferred_api_key"),
        preferred_base_url=_coalesce("preferred_base_url"),
    )


def anthropic_key_available() -> bool:
    """True when the backend has an Anthropic API key in the environment."""
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def anthropic_voice_execution_context() -> ProviderContext | None:
    """Provider context that routes voice ``plan_and_execute`` onto Anthropic.

    Returns ``None`` when no Anthropic key is configured so callers keep the
    session (usually Gemini) preferred provider.
    """
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        return None
    model: str | None = None
    try:
        from llm import provider_meta

        models = provider_meta("anthropic").default_models
        if models:
            model = models[0]
    except Exception:  # noqa: BLE001
        logger.debug("anthropic_voice_execution_context: provider_meta failed", exc_info=True)
    return ProviderContext(
        preferred="anthropic",
        preferred_model=model,
        preferred_api_key=key,
        preferred_base_url=None,
    )


def inject_provider_tool_args(
    tool_name: str,
    args: dict[str, Any],
    *,
    preferred: str | None = None,
    preferred_model: str | None = None,
    preferred_api_key: str | None = None,
    preferred_base_url: str | None = None,
    holder: ProviderContextHolder | None = None,
    voice_handoff: bool = False,
) -> dict[str, Any]:
    """Attach preferred provider fields to ``plan_and_execute`` args when enabled.

    When ``voice_handoff`` is True and Anthropic is configured, nested planning
    uses Claude instead of the Gemini Live session provider.
    """
    if not provider_context_enabled() or tool_name != "plan_and_execute":
        return args

    explicit = ProviderContext(
        preferred=preferred,
        preferred_model=preferred_model,
        preferred_api_key=preferred_api_key,
        preferred_base_url=preferred_base_url,
    )
    session_ctx = holder.snapshot() if holder is not None else get_provider_context()
    if voice_handoff:
        handoff = anthropic_voice_execution_context()
        if handoff is not None:
            ctx = merge_provider_context(explicit, handoff)
            logger.info(
                "[provider_context] voice plan_and_execute → anthropic (Gemini speaks summary)"
            )
        else:
            ctx = merge_provider_context(explicit, session_ctx)
    else:
        ctx = merge_provider_context(explicit, session_ctx)
    if not any(
        (
            ctx.preferred,
            ctx.preferred_model,
            ctx.preferred_api_key,
            ctx.preferred_base_url,
        )
    ):
        return args

    merged = dict(args)
    mapping = (
        ("preferred", "_preferred", ctx.preferred),
        ("preferred_model", "_preferred_model", ctx.preferred_model),
        ("preferred_api_key", "_preferred_api_key", ctx.preferred_api_key),
        ("preferred_base_url", "_preferred_base_url", ctx.preferred_base_url),
    )
    for public, private, value in mapping:
        if value and not merged.get(public) and not merged.get(private):
            merged[private] = value
    return merged
