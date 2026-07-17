"""Run /agent/task through orchestrator.orchestrate — shared engine with plan_and_execute."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from collections.abc import Callable
from typing import Any

from orchestrator.capabilities import Capability
from orchestrator.complete import complete
from orchestrator.conductor import candidates_for
from orchestrator.policy import AutonomyPolicy, policy_block_result
from tool_registry import TOOLS_NEEDING_APPROVAL, dispatch_sync
from voice_tool_approval import VoiceToolApprovalWaiter

logger = logging.getLogger(__name__)

# Tools the planner must never invoke (same as orchestrator.agents).
_REENTRANT_TOOLS = frozenset({"plan_and_execute"})


def orchestrator_task_queue_enabled() -> bool:
    """Feature flag: /agent/task uses orchestrator instead of agent/planner (on by default)."""
    val = os.environ.get("ASSISTANT_ORCHESTRATOR_TASK_QUEUE", "").strip().lower()
    if val in ("0", "false", "no", "off"):
        return False
    return True


def _make_event(type_: str, **payload: Any) -> str:
    return json.dumps({"type": type_, **payload})


def _emit(
    loop: asyncio.AbstractEventLoop,
    queue: asyncio.Queue,
    type_: str,
    **payload: Any,
) -> None:
    event = _make_event(type_, **payload)

    async def _put() -> None:
        await queue.put(event)

    try:
        asyncio.run_coroutine_threadsafe(_put(), loop)
    except Exception:  # noqa: BLE001
        logger.debug("[orchestrator_runner] failed to emit %s", type_, exc_info=True)


def _build_reason_fn(
    task: Any,
    loop: asyncio.AbstractEventLoop,
) -> Callable[[Capability, str, str], str]:
    """Conductor-backed reason_fn with provider relay events for the visualizer."""

    def _on_relay(from_id: str, to_id: str, reason: str) -> None:
        _emit(
            loop,
            task.events,
            "provider_relay",
            **{"from": from_id, "to": to_id, "reason": reason, "kind": "reasoning"},
        )

    def _reason(capability: Capability, system: str, user: str) -> str:
        cands = candidates_for(
            capability,
            preferred=task.provider,
            preferred_model=task.model,
            preferred_api_key=task.api_key,
            preferred_base_url=task.base_url,
        )
        return complete(
            capability,
            system,
            user,
            preferred=task.provider,
            candidates=cands,
            on_relay=_on_relay,
            relay_kind="reasoning",
        )

    return _reason


def _build_approval_dispatch_fn(
    task: Any,
    loop: asyncio.AbstractEventLoop,
    waiter: VoiceToolApprovalWaiter,
) -> Callable[[str, dict[str, Any]], dict[str, Any]]:
    """Same consent order as voice: prepare → emit → wait → policy → dispatch."""

    async def _request_approval(call_id: str, tool: str) -> bool:
        if task.cancel_event.is_set():
            return False
        if tool == "screen_capture" and waiter.screen_capture_session_active():
            return True
        fut = waiter.prepare(call_id)
        await task.events.put(
            _make_event("tool_approval_required", call_id=call_id, tool=tool)
        )
        try:
            return await asyncio.wait_for(fut, timeout=120.0)
        except asyncio.TimeoutError:
            logger.warning(
                "[orchestrator_runner] approval timed out call_id=%s tool=%s",
                call_id,
                tool,
            )
            if not fut.done():
                waiter.resolve(call_id, False)
            return False

    def _dispatch(tool: str, args: dict[str, Any]) -> dict[str, Any]:
        if tool in _REENTRANT_TOOLS:
            return {"ok": False, "error": "nested planning is not allowed"}

        approved_tool = True
        if tool in TOOLS_NEEDING_APPROVAL:
            call_id = str(uuid.uuid4())
            try:
                approved_tool = asyncio.run_coroutine_threadsafe(
                    _request_approval(call_id, tool),
                    loop,
                ).result(timeout=130)
            except Exception:  # noqa: BLE001
                logger.exception(
                    "[orchestrator_runner] approval wait failed tool=%s", tool
                )
                approved_tool = False

        if not approved_tool:
            return {"ok": False, "error": "User denied or approval unavailable"}

        if blocked := policy_block_result(
            tool,
            args,
            allow_sensitive=bool(getattr(task, "allow_sensitive", False)),
            approved_tool=approved_tool,
        ):
            return blocked

        approval_ok = (tool not in TOOLS_NEEDING_APPROVAL) or approved_tool
        return dispatch_sync(tool, args or {}, approval_granted=approval_ok)

    return _dispatch


def run_orchestrator_for_task(task: Any, loop: asyncio.AbstractEventLoop) -> dict[str, Any]:
    """
    Synchronous orchestrator run for one AgentTask.

    Emits the same SSE event types the Tesseract visualizer expects, plus
    ``tool_approval_required`` when a voice-parity consent gate is needed.
    """
    from orchestrator import orchestrate
    from orchestrator.audit import default_adapter as audit_adapter
    from orchestrator.budget import Budget
    from orchestrator.memory import default_adapter as memory_adapter
    from orchestrator.skills import default_adapter as skill_adapter

    waiter: VoiceToolApprovalWaiter = getattr(task, "approval_waiter", None) or VoiceToolApprovalWaiter()
    task.approval_waiter = waiter
    allow_sensitive = bool(getattr(task, "allow_sensitive", False))

    _emit(loop, task.events, "task_start", goal=task.goal)

    def _progress(type_: str, payload: dict[str, Any]) -> None:
        _emit(loop, task.events, type_, **payload)

    def _cancelled() -> bool:
        return task.cancel_event.is_set()

    return orchestrate(
        task.goal,
        max_steps=8,
        reason_fn=_build_reason_fn(task, loop),
        dispatch_fn=_build_approval_dispatch_fn(task, loop, waiter),
        memory=memory_adapter(),
        skills=skill_adapter(),
        policy=AutonomyPolicy(allow_sensitive=allow_sensitive),
        budget=Budget(max_tool_calls=8),
        audit=audit_adapter(task.goal),
        progress=_progress,
        cancel_check=_cancelled,
    )
