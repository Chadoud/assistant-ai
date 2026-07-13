"""Mirror orchestrator progress into the agent-task SSE queue for the cube visualizer.

Voice and ``plan_and_execute`` run synchronously on a worker thread while the
frontend listens to ``GET /agent/task/{id}``. This module bridges the two by
pushing the same event shapes ``task_queue`` emits, using the FastAPI event loop
for thread-safe queue writes.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_delivery_loop: asyncio.AbstractEventLoop | None = None


def set_mirror_loop(loop: asyncio.AbstractEventLoop | None) -> None:
    """Install the loop used for thread-safe writes (typically the voice session loop)."""
    global _delivery_loop
    _delivery_loop = loop


def _make_event(type_: str, **payload: Any) -> str:
    return json.dumps({"type": type_, **payload})


def orchestrator_steps_to_tree(steps: list[Any]) -> list[dict[str, Any]]:
    """Map orchestrator :class:`Step` objects to the plan_ready tree shape."""
    tree: list[dict[str, Any]] = []
    for step in steps:
        tree.append(
            {
                "index": int(getattr(step, "id", len(tree) + 1)),
                "description": str(getattr(step, "description", "") or f"Step {len(tree) + 1}"),
                "command_id": getattr(step, "tool", None),
                "subtasks": [],
            }
        )
    return tree


def mirror_event(task_id: str, type_: str, **payload: Any) -> None:
    """Best-effort push of one SSE frame onto a mirror task's queue."""
    from agent.task_queue import get_task

    task = get_task(task_id)
    if task is None:
        return
    loop = _delivery_loop
    if loop is None or not loop.is_running():
        logger.debug("[plan_mirror] no delivery loop; skip %s for %s", type_, task_id)
        return
    try:
        fut = asyncio.run_coroutine_threadsafe(
            task.events.put(_make_event(type_, **payload)),
            loop,
        )
        fut.result(timeout=2.0)
    except Exception as exc:
        logger.warning("[plan_mirror] failed to mirror %s for %s: %s", type_, task_id, exc)


def finalize_mirror_task(task_id: str) -> None:
    """Close the mirror task SSE stream."""
    from agent.task_queue import get_task

    task = get_task(task_id)
    if task is None:
        return
    loop = _delivery_loop
    if loop is None or not loop.is_running():
        return
    try:
        fut = asyncio.run_coroutine_threadsafe(task.events.put(None), loop)
        fut.result(timeout=2.0)
    except Exception as exc:
        logger.warning("[plan_mirror] finalize failed for %s: %s", task_id, exc)
