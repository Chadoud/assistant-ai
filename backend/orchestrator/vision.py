"""Relay-aware, single-shot vision completion.

Screen/browser automation needs to ask "look at this screenshot and tell me the
next action". This is the perception twin of ``complete.py``: it runs the
Conductor's failover policy for a one-shot *image + prompt*, trying each
configured, vision-capable candidate for ``Capability.VISION`` and relaying to the
next provider on a transient (quota/5xx/timeout) failure.

So when Gemini's free tier is rate-limited, screen navigation keeps working by
switching to Claude or OpenAI vision instead of stalling — the same way chat
already fails over.

Raises ``VisionError`` if every candidate fails or none is configured.
"""

from __future__ import annotations

import logging
from typing import Callable

from llm.base import StreamError, TextDelta, image_part, text_part

from .capabilities import Capability
from .conductor import Candidate, candidates_for
from .health import REGISTRY, is_transient_error, parse_retry_after, should_relay_vision_error

logger = logging.getLogger(__name__)

# Called as ``on_relay(from_provider_id, to_provider_id)`` on each hand-off.
OnRelay = Callable[[str, str], None]


class VisionError(RuntimeError):
    """No vision candidate could complete the request."""


def audit_relay_callback(goal: str) -> OnRelay:
    """An ``on_relay`` hook that records each vision provider hand-off to the audit log.

    Lets the user (or a dashboard) see exactly when perception switched providers and
    why — e.g. "Vision switched from gemini to anthropic (provider unavailable)".
    """
    from .audit import record_action

    def _hook(src: str, dst: str) -> None:
        record_action(
            "vision_relay",
            goal=goal,
            risk="safe",
            args={"from": src, "to": dst},
            outcome="relayed",
            detail=f"Vision switched from {src} to {dst} (provider unavailable).",
        )

    return _hook


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


def vision_complete(
    prompt: str,
    image: bytes,
    *,
    mime_type: str = "image/jpeg",
    system: str | None = None,
    preferred: str | None = None,
    candidates: list[Candidate] | None = None,
    on_relay: OnRelay | None = None,
) -> str:
    """Single-shot image understanding for a prompt, with provider failover.

    :param prompt: the text question/instruction shown alongside the image.
    :param image: raw image bytes (e.g. a JPEG screenshot).
    :param mime_type: the image's MIME type.
    :param system: optional system prompt.
    :param preferred: provider id to try first (optional).
    :param candidates: pre-built candidate list (optional; otherwise resolved from
        the VISION chain, filtered to vision-capable providers).
    :param on_relay: optional callback invoked on each provider hand-off.
    :returns: the model's text answer (often a JSON string the caller parses).
    :raises VisionError: if no candidate succeeds or none is configured.
    """
    cands = (
        candidates
        if candidates is not None
        else candidates_for(Capability.VISION, preferred=preferred, require_vision=True)
    )
    if not cands:
        raise VisionError(
            "No vision-capable AI provider is configured. Add a Gemini, OpenAI, or "
            "Anthropic key in Settings."
        )

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": [text_part(prompt), image_part(image, mime_type)]})

    last_error = "all vision providers failed"
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
            relay = should_relay_vision_error(error)
            REGISTRY.record_failure(
                cand.provider_id,
                retry_after=parse_retry_after(error) if is_transient_error(error) else None,
            )
            last_error = error
            from .quota_notice import maybe_emit_quota_notice

            maybe_emit_quota_notice(error, provider=cand.provider_id)
            if relay and has_more:
                nxt = cands[index + 1].provider_id
                logger.info("vision relay: %s failed → %s", cand.provider_id, nxt)
                # Notify any live UI sink (chat SSE) as it happens.
                from .relay_events import publish

                publish({"from": cand.provider_id, "to": nxt, "kind": "vision",
                         "reason": error[:200]})
                if on_relay is not None:
                    try:
                        on_relay(cand.provider_id, nxt)
                    except Exception:  # noqa: BLE001 - a logging callback must never break relay
                        logger.debug("vision on_relay callback raised", exc_info=True)
                continue
            raise VisionError(error)
        # Empty text without error — try the next provider if any.
        last_error = "empty response"
        if has_more:
            nxt = cands[index + 1].provider_id
            logger.info("vision relay: %s empty → %s", cand.provider_id, nxt)
            continue
    raise VisionError(last_error)
