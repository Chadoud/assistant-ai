"""Run /agent/task through orchestrator.orchestrate — shared engine with plan_and_execute."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import Callable
from typing import Any

from orchestrator.capabilities import Capability
from orchestrator.complete import complete
from orchestrator.conductor import candidates_for

logger = logging.getLogger(__name__)


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


def run_orchestrator_for_task(task: Any, loop: asyncio.AbstractEventLoop) -> dict[str, Any]:
    """
    Synchronous orchestrator run for one AgentTask.

    Emits the same SSE event types the Tesseract visualizer expects.
    """
    from orchestrator import orchestrate
    from orchestrator.audit import default_adapter as audit_adapter
    from orchestrator.budget import Budget
    from orchestrator.memory import default_adapter as memory_adapter
    from orchestrator.policy import AutonomyPolicy
    from orchestrator.skills import default_adapter as skill_adapter

    _emit(loop, task.events, "task_start", goal=task.goal)

    def _progress(type_: str, payload: dict[str, Any]) -> None:
        _emit(loop, task.events, type_, **payload)

    def _cancelled() -> bool:
        return task.cancel_event.is_set()

    return orchestrate(
        task.goal,
        max_steps=8,
        reason_fn=_build_reason_fn(task, loop),
        memory=memory_adapter(),
        skills=skill_adapter(),
        policy=AutonomyPolicy(allow_sensitive=True),
        budget=Budget(max_tool_calls=8),
        audit=audit_adapter(task.goal),
        progress=_progress,
        cancel_check=_cancelled,
    )
