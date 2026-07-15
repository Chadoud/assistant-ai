"""Relay-aware chat: stream a reply, failing over across providers on quota/errors.

Wraps the per-provider tool-calling loop (``llm.chat_loop.stream_chat_completion``)
with the Conductor's failover policy: try each candidate in order, skip ones that
are cooling down, and when a provider errors *before producing any output* with a
transient error (429/quota/5xx/timeout) or invalid model (404), record the failure
and relay to the next provider — emitting an honest ``relay`` event so the UI can
show the hand-off.

Once a provider has started streaming text/tool calls, a mid-stream failure is
surfaced as a normal error (we don't restart a half-written answer on another
engine). Emits the same SSE JSON contract as ``stream_chat_completion`` plus:

    {"relay": {"from": "...", "to": "...", "reason": "..."}}   provider hand-off
"""

from __future__ import annotations

import json
import logging
from typing import Any, Iterator

from llm.base import ToolSpec
from llm.chat_loop import stream_chat_completion

from .conductor import Candidate
from .health import REGISTRY, is_failover_error, parse_retry_after

logger = logging.getLogger(__name__)


def _classify(payload: str) -> tuple[str, dict[str, Any]]:
    """Return (kind, parsed) for an SSE payload string from the chat loop."""
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return "other", {}
    if "delta" in obj:
        return "delta", obj
    if "tool_call" in obj:
        return "tool_call", obj
    if "tool_result" in obj:
        return "tool_result", obj
    if "error" in obj:
        return "error", obj
    if "done" in obj:
        return "done", obj
    return "other", obj


def stream_chat_with_relay(
    candidates: list[Candidate],
    messages: list[dict[str, Any]],
    *,
    tools: list[ToolSpec] | None = None,
    allow_sensitive: bool = False,
) -> Iterator[str]:
    """Stream a chat completion, relaying across candidates on transient failure.

    :param candidates: ordered engines from ``conductor.candidates_for``.
    :param messages: normalized chat messages.
    :param tools: shared tool catalog (passed to every candidate; all configured
        providers support tools).
    """
    if not candidates:
        yield json.dumps(
            {"error": "No AI provider is configured. Add a key in Settings → AI Provider."}
        )
        return

    last_error = "all providers failed"
    for index, cand in enumerate(candidates):
        has_more = index < len(candidates) - 1
        availability = REGISTRY.check(cand.provider_id)
        if not availability.ok and has_more:
            logger.info(
                "relay: skip %s (%s, retry %.0fs)",
                cand.provider_id,
                availability.reason,
                availability.retry_after,
            )
            yield json.dumps(
                {
                    "relay": {
                        "from": cand.provider_id,
                        "to": candidates[index + 1].provider_id,
                        "reason": availability.reason,
                    }
                }
            )
            continue

        produced = False
        relayed = False
        for payload in stream_chat_completion(
            cand.provider,
            messages,
            cand.model,
            tools=tools,
            api_key=cand.api_key,
            base_url=cand.base_url,
            allow_sensitive=allow_sensitive,
        ):
            kind, obj = _classify(payload)
            if kind in ("delta", "tool_call", "tool_result"):
                produced = True
                yield payload
            elif kind == "done":
                REGISTRY.record_success(cand.provider_id)
                yield payload
                return
            elif kind == "error":
                message = str(obj.get("error") or "")
                failover = is_failover_error(message)
                REGISTRY.record_failure(
                    cand.provider_id,
                    retry_after=parse_retry_after(message) if failover else None,
                )
                if not produced and failover and has_more:
                    last_error = message
                    nxt = candidates[index + 1].provider_id
                    logger.info("relay: %s failed (%s) → %s", cand.provider_id, message[:120], nxt)
                    yield json.dumps(
                        {
                            "relay": {
                                "from": cand.provider_id,
                                "to": nxt,
                                "reason": message[:200],
                            }
                        }
                    )
                    relayed = True
                    break
                yield payload
                return
            else:
                yield payload
        if not relayed:
            # Generator ended without an explicit done/error sentinel — treat as complete.
            return

    yield json.dumps({"error": last_error})
