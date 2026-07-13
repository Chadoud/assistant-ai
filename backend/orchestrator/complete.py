"""Non-streaming, relay-aware single-shot completion.

The planner/executor/critic agents need a simple "ask a capability, get text back"
call — not an SSE stream. This runs the Conductor's failover policy for a one-shot
prompt: try each configured candidate for the capability, accumulate its text, and
relay to the next provider on a transient (quota/5xx/timeout) or invalid-model
(404) failure.

Raises ``CompletionError`` if every candidate fails or none is configured.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from llm.base import StreamError, TextDelta

from .capabilities import Capability
from .conductor import Candidate, candidates_for
from .health import REGISTRY, is_failover_error, parse_retry_after

logger = logging.getLogger(__name__)


class CompletionError(RuntimeError):
    """No candidate could complete the request."""


OnRelay = Callable[[str, str, str], None]
"""Callback invoked on provider hand-off: (from_id, to_id, reason)."""


def _complete_once(candidate: Candidate, messages: list[dict]) -> tuple[str, str | None]:
    """Run one candidate. Returns (text, error_message_or_None)."""
    text = ""
    error: str | None = None
    for event in candidate.provider.stream(
        messages,
        candidate.model,
        tools=None,
        api_key=candidate.api_key,
        base_url=candidate.base_url,
    ):
        if isinstance(event, TextDelta):
            text += event.text
        elif isinstance(event, StreamError):
            error = event.message
            break
    return text, error


def complete(
    capability: Capability,
    system: str,
    user: str,
    *,
    preferred: str | None = None,
    candidates: list[Candidate] | None = None,
    on_relay: OnRelay | None = None,
    relay_kind: str = "reasoning",
) -> str:
    """Single-shot completion for a capability, with provider failover.

    :param system: system prompt.
    :param user: user message.
    :param preferred: provider id to try first (optional).
    :param candidates: pre-built candidate list (optional; otherwise resolved from
        the capability chain).
    :param on_relay: optional callback invoked on each failover provider hand-off.
    :param relay_kind: label included in relay_events publish (e.g. ``reasoning``).
    :raises CompletionError: if no candidate succeeds.
    """
    cands = (
        candidates
        if candidates is not None
        else candidates_for(capability, preferred=preferred)
    )
    if not cands:
        raise CompletionError("No AI provider is configured for this capability.")

    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_error = "all providers failed"
    for index, cand in enumerate(cands):
        has_more = index < len(cands) - 1
        availability = REGISTRY.check(cand.provider_id)
        if not availability.ok and has_more:
            continue
        text, error = _complete_once(cand, messages)
        if error is None and text.strip():
            REGISTRY.record_success(cand.provider_id)
            return text
        if error is not None:
            failover = is_failover_error(error)
            REGISTRY.record_failure(
                cand.provider_id,
                retry_after=parse_retry_after(error) if failover else None,
            )
            last_error = error
            if failover and has_more:
                nxt = cands[index + 1].provider_id
                logger.info("complete relay: %s failed → %s", cand.provider_id, nxt)
                from .relay_events import publish

                publish({
                    "from": cand.provider_id,
                    "to": nxt,
                    "kind": relay_kind,
                    "reason": error[:200],
                })
                if on_relay is not None:
                    try:
                        on_relay(cand.provider_id, nxt, error[:200])
                    except Exception:  # noqa: BLE001 - relay callbacks must not break failover
                        logger.debug("complete on_relay callback raised", exc_info=True)
                continue
            raise CompletionError(error)
        # Empty text without error — try the next provider if any.
        last_error = "empty response"
    raise CompletionError(last_error)
