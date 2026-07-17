"""``plan_and_execute`` tool — run the autonomous planner→executor→critic loop.

For complex, multi-step goals that no single tool covers, this hands the goal to
the orchestrator: it plans the steps, executes them (real tool calls + reasoning),
self-checks each result, and returns a summary plus a per-step log. Engine choice
for the reasoning routes through the Conductor, so it inherits provider failover.

This is the CANONICAL autonomous stack (policy/risk gating, budget, audit, memory,
skills). The separate ``/agent/task`` SSE runner (``agent/task_queue.py``) exists
only to feed the Tesseract visualizer. See ``docs/ARCHITECTURE_AGENT_EXECUTION.md``.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from provider_context import (
    get_provider_context,
    merge_provider_context,
    provider_context_enabled,
    resolve_preferred_from_parameters,
)

logger = logging.getLogger(__name__)

_MAX_STEPS_CAP = 12
_DEFAULT_MAX_STEPS = 8


def _build_reason_fn(
    preferred: str | None,
    preferred_model: str | None,
    preferred_api_key: str | None,
    preferred_base_url: str | None,
) -> Callable[[Any, str, str], str]:
    """Return a Conductor-backed completion function honoring the user's provider."""
    # Lazy imports avoid orchestrator ↔ tool_registry ↔ agent_task cycles at import time.
    from orchestrator.complete import complete
    from orchestrator.conductor import candidates_for

    def _reason(capability: Any, system: str, user: str) -> str:
        cands = candidates_for(
            capability,
            preferred=preferred,
            preferred_model=preferred_model,
            preferred_api_key=preferred_api_key,
            preferred_base_url=preferred_base_url,
        )
        return complete(
            capability,
            system,
            user,
            preferred=preferred,
            candidates=cands,
            relay_kind="reasoning",
        )

    return _reason


def plan_and_execute(parameters: dict[str, Any]) -> dict[str, Any]:
    """Plan and carry out a multi-step ``goal`` autonomously.

    :param parameters: ``goal`` (required, plain-language) and optional ``max_steps``
        (1-12, default 8). Optional provider fields (``preferred``, ``preferred_model``,
        ``preferred_api_key``, ``preferred_base_url`` or ``_``-prefixed equivalents)
        route planning through the user's active chat engine.
    :returns: ``{ok, summary, goal, steps, log}`` or ``{ok: False, error}``.
    """
    goal = str(parameters.get("goal", "")).strip()
    if not goal:
        return {"ok": False, "error": "goal is required (describe the multi-step task)."}

    try:
        max_steps = int(parameters.get("max_steps", _DEFAULT_MAX_STEPS))
    except (TypeError, ValueError):
        max_steps = _DEFAULT_MAX_STEPS
    max_steps = min(max(max_steps, 1), _MAX_STEPS_CAP)

    from orchestrator import orchestrate
    from orchestrator.agents import make_dispatch_fn
    from orchestrator.audit import default_adapter as audit_adapter
    from orchestrator.budget import Budget
    from orchestrator.memory import default_adapter as memory_adapter
    from orchestrator.policy import AutonomyPolicy
    from orchestrator.skills import default_adapter as skill_adapter

    logger.info("[plan_and_execute] goal=%r max_steps=%d", goal[:120], max_steps)

    visualizer_task_id = str(parameters.get("_visualizer_task_id", "") or "").strip() or None
    progress = None
    if visualizer_task_id:
        from agent.plan_mirror import finalize_mirror_task, mirror_event

        mirror_event(visualizer_task_id, "task_start", goal=goal)

        def _progress(type_: str, payload: dict[str, Any]) -> None:
            mirror_event(visualizer_task_id, type_, **payload)

        progress = _progress

    explicit = resolve_preferred_from_parameters(parameters)
    session_ctx = get_provider_context() if provider_context_enabled() else None
    ctx = merge_provider_context(explicit, session_ctx)
    reason_fn = None
    if provider_context_enabled() and any(
        (
            ctx.preferred,
            ctx.preferred_model,
            ctx.preferred_api_key,
            ctx.preferred_base_url,
        )
    ):
        reason_fn = _build_reason_fn(
            ctx.preferred,
            ctx.preferred_model,
            ctx.preferred_api_key,
            ctx.preferred_base_url,
        )
        logger.info(
            "[plan_and_execute] preferred provider=%s model=%s",
            ctx.preferred or "?",
            (ctx.preferred_model or "?")[:80],
        )

    try:
        allow_sensitive = bool(
            parameters.get("allow_sensitive")
            or parameters.get("autonomous_mode")
            or parameters.get("_approval_granted")
        )
        # One-shot for this orchestrate() call only: outer voice/chat approval
        # (or autonomous mode) both opens AutonomyPolicy and sets
        # approval_granted on nested TOOLS_NEEDING_APPROVAL — same as chat_loop.
        result = orchestrate(
            goal,
            max_steps=max_steps,
            reason_fn=reason_fn,
            dispatch_fn=make_dispatch_fn(approval_granted=allow_sensitive),
            memory=memory_adapter(),
            skills=skill_adapter(),
            policy=AutonomyPolicy(allow_sensitive=allow_sensitive),
            budget=Budget(max_tool_calls=max_steps),
            audit=audit_adapter(goal),
            progress=progress,
        )
        if visualizer_task_id:
            finalize_mirror_task(visualizer_task_id)
        if visualizer_task_id and isinstance(result, dict):
            result = {**result, "visualizer_task_id": visualizer_task_id}
        return result
    except Exception as exc:  # noqa: BLE001
        logger.exception("plan_and_execute")
        if visualizer_task_id:
            from agent.plan_mirror import finalize_mirror_task, mirror_event

            mirror_event(visualizer_task_id, "task_error", error=str(exc))
            finalize_mirror_task(visualizer_task_id)
        return {"ok": False, "error": str(exc)}
