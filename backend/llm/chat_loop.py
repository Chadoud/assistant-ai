"""
Provider-agnostic streaming chat with a tool-calling loop.

This is the single entry point the ``/assistant/chat`` route uses for every provider.
It drives the model turn by turn: stream text, and whenever the model requests tools,
execute them through ``tool_registry.dispatch_sync`` and feed the results back until
the model produces a final answer.

Yields SSE-ready JSON strings (the route prefixes each with ``data: ``):
    {"delta": "..."}                       streamed assistant text
    {"tool_call": {"name": "..."}}         a tool is about to run
    {"tool_result": {"name": "...", "ok": true}}   a tool finished
    {"done": true, "full": "..."}          final answer
    {"error": "..."}                       terminal failure
"""

from __future__ import annotations

import json
import logging
import queue
import threading
from typing import Any, Iterator

from conversation_origin_catalog import mirror_tool_result_content
from provider_context import (
    ProviderContext,
    clear_provider_context,
    inject_provider_tool_args,
    set_provider_context,
)

from .base import (
    ChatProvider,
    Message,
    StreamError,
    TextDelta,
    ToolCall,
    ToolCallRequest,
    ToolSpec,
)

logger = logging.getLogger(__name__)

# Hard ceiling on tool round-trips per user message, to bound latency and cost.
MAX_TOOL_ITERATIONS = 6

# How often to poll a running tool's relay queue (seconds) — small enough that a
# provider hand-off surfaces near-instantly, large enough to stay idle-cheap.
_RELAY_POLL_INTERVAL_S = 0.2


def stream_chat_completion(
    provider: ChatProvider,
    messages: list[Message],
    model: str,
    *,
    tools: list[ToolSpec] | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    allow_sensitive: bool = False,
) -> Iterator[str]:
    """Run the full chat + tool-calling loop, yielding SSE JSON payload strings."""
    from tool_registry import dispatch_sync

    conversation: list[Message] = list(messages)
    full_text = ""
    provider_id = getattr(provider, "id", None)
    set_provider_context(
        ProviderContext(
            preferred=str(provider_id).strip().lower() if provider_id else None,
            preferred_model=model,
            preferred_api_key=api_key,
            preferred_base_url=base_url,
        )
    )

    try:
        for iteration in range(MAX_TOOL_ITERATIONS + 1):
            turn_text = ""
            pending_calls: list[ToolCall] = []
            errored = False

            for event in provider.stream(
                conversation,
                model,
                tools=tools,
                api_key=api_key,
                base_url=base_url,
            ):
                if isinstance(event, TextDelta):
                    turn_text += event.text
                    full_text += event.text
                    yield json.dumps({"delta": event.text})
                elif isinstance(event, ToolCallRequest):
                    pending_calls = event.calls
                elif isinstance(event, StreamError):
                    errored = True
                    yield json.dumps({"error": event.message})
                    break

            if errored:
                return

            if not pending_calls:
                yield json.dumps({"done": True, "full": full_text})
                return

            # Stop calling tools once we hit the ceiling; ask the model to wrap up with text only.
            if iteration >= MAX_TOOL_ITERATIONS:
                logger.warning(
                    "chat_loop hit MAX_TOOL_ITERATIONS=%d; finalizing",
                    MAX_TOOL_ITERATIONS,
                )
                yield json.dumps({"done": True, "full": full_text})
                return

            conversation.append(
                {"role": "assistant", "content": turn_text, "tool_calls": pending_calls}
            )
            for call in pending_calls:
                yield json.dumps({"tool_call": {"name": call.name}})
                result: dict[str, Any] = {"ok": False, "error": "tool produced no result"}
                for kind, payload in _run_tool_streaming_relays(
                    dispatch_sync,
                    call,
                    provider_id=provider_id,
                    model=model,
                    api_key=api_key,
                    base_url=base_url,
                    allow_sensitive=allow_sensitive,
                ):
                    if kind == "relay":
                        yield json.dumps({"relay": payload})
                    else:
                        result = payload
                ok = bool(result.get("ok", False)) if isinstance(result, dict) else False
                tool_payload: dict[str, Any] = {"name": call.name, "ok": ok}
                mirrored = mirror_tool_result_content(call.name, result)
                if mirrored:
                    tool_payload["content"] = mirrored
                yield json.dumps({"tool_result": tool_payload})
                if (
                    call.name == "manage_connection"
                    and ok
                    and isinstance(result, dict)
                    and isinstance(result.get("data"), dict)
                ):
                    data = result["data"]
                    action = data.get("action")
                    provider_id = data.get("provider_id")
                    if action and provider_id:
                        yield json.dumps({
                            "client_action": {
                                "action": action,
                                "provider_id": provider_id,
                                "provider_label": data.get("provider_label") or provider_id,
                            },
                        })
                conversation.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": call.name,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
    finally:
        clear_provider_context()


def _run_tool(
    dispatch_sync: Any,
    call: ToolCall,
    *,
    provider_id: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    allow_sensitive: bool = False,
) -> dict[str, Any]:
    """Execute one tool call, never raising — failures become a result the model can read."""
    from orchestrator.policy import AutonomyPolicy

    arguments = inject_provider_tool_args(
        call.name,
        dict(call.arguments),
        preferred=str(provider_id).strip().lower() if provider_id else None,
        preferred_model=model,
        preferred_api_key=api_key,
        preferred_base_url=base_url,
    )
    try:
        policy = AutonomyPolicy(allow_sensitive=allow_sensitive)
        decision = policy.check(call.name, arguments)
        if not decision.allowed:
            return {"ok": False, "error": decision.reason}
        # Autonomous mode pre-authorizes side effects; otherwise approval-tier tools stay denied.
        return dispatch_sync(call.name, arguments, approval_granted=allow_sensitive)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tool %s crashed in chat loop", call.name)
        return {"ok": False, "error": str(exc)}


def _run_tool_streaming_relays(
    dispatch_sync: Any,
    call: ToolCall,
    *,
    provider_id: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    allow_sensitive: bool = False,
) -> Iterator[tuple[str, dict[str, Any]]]:
    """Run a tool while streaming provider hand-offs that happen *inside* it.

    Yields ``("relay", event)`` the moment a relay is published (e.g. vision failing
    over from Gemini to Claude during ``control_computer``), then a final
    ``("result", result_dict)``. The tool runs on a worker thread so relays can be
    forwarded live while it blocks; if anything about that path fails we still return
    a result, so chat never stalls.
    """
    from orchestrator.relay_events import using_sink

    relays: "queue.Queue[dict[str, Any]]" = queue.Queue()
    box: dict[str, dict[str, Any]] = {}

    def _worker() -> None:
        with using_sink(relays.put):
            box["result"] = _run_tool(
                dispatch_sync,
                call,
                provider_id=provider_id,
                model=model,
                api_key=api_key,
                base_url=base_url,
                allow_sensitive=allow_sensitive,
            )

    worker = threading.Thread(target=_worker, name=f"tool-{call.name}", daemon=True)
    worker.start()

    while True:
        try:
            yield "relay", relays.get(timeout=_RELAY_POLL_INTERVAL_S)
        except queue.Empty:
            if not worker.is_alive():
                break

    worker.join(timeout=1.0)
    while not relays.empty():  # drain anything published just before exit
        yield "relay", relays.get_nowait()

    yield "result", box.get("result", {"ok": False, "error": "tool produced no result"})
