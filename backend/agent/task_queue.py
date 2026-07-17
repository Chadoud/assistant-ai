"""
Agent task queue — manages active tasks and their SSE event streams.

Each task streams progress events via asyncio.Queue and supports cancellation.

Execution uses ``orchestrator.orchestrate`` via ``agent/orchestrator_runner.py``
(the same engine as ``plan_and_execute``). Set ``ASSISTANT_ORCHESTRATOR_TASK_QUEUE=0``
to fall back to the legacy ``planner.plan_goal`` path.
See ``docs/ARCHITECTURE_AGENT_EXECUTION.md``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncGenerator

from voice_tool_approval import VoiceToolApprovalWaiter

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


@dataclass
class AgentTask:
    task_id: str
    goal: str
    status: TaskStatus = TaskStatus.queued
    result: str | None = None
    error: str | None = None
    provider: str = "ollama"
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    """When True, AutonomyPolicy allows SENSITIVE (non-APPROVAL) tools — same as voice autonomousMode."""
    allow_sensitive: bool = False
    approval_waiter: VoiceToolApprovalWaiter = field(default_factory=VoiceToolApprovalWaiter)
    events: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=256))
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)


# Global in-memory registry (survives for the lifetime of the process)
_tasks: dict[str, AgentTask] = {}


def create_task(
    goal: str,
    *,
    provider: str = "ollama",
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    allow_sensitive: bool = False,
) -> AgentTask:
    task_id = str(uuid.uuid4())
    task = AgentTask(
        task_id=task_id,
        goal=goal,
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url,
        allow_sensitive=allow_sensitive,
    )
    _tasks[task_id] = task
    return task


def get_task(task_id: str) -> AgentTask | None:
    return _tasks.get(task_id)


def cancel_task(task_id: str) -> bool:
    task = _tasks.get(task_id)
    if not task:
        return False
    task.cancel_event.set()
    task.approval_waiter.deny_all()
    return True


def _make_event(type_: str, **payload) -> str:
    return json.dumps({"type": type_, **payload})


def _plan_tree(steps) -> list[dict]:
    """Serialize the planned steps + subtasks into the labeled tree sent on plan_ready."""
    return [
        {
            "index": step.index,
            "description": step.description,
            "command_id": step.command_id,
            "subtasks": [
                {
                    "index": sub.index,
                    "description": sub.description,
                    "command_id": sub.command_id,
                }
                for sub in step.subtasks
            ],
        }
        for step in steps
    ]


async def run_task(task: AgentTask) -> None:
    """Run a task asynchronously, streaming events to task.events queue."""
    from agent.orchestrator_runner import orchestrator_task_queue_enabled, run_orchestrator_for_task

    task.status = TaskStatus.running
    loop = asyncio.get_running_loop()

    try:
        if orchestrator_task_queue_enabled():
            outcome = await asyncio.to_thread(run_orchestrator_for_task, task, loop)
            if task.cancel_event.is_set() or outcome.get("error") == "cancelled":
                task.status = TaskStatus.cancelled
            elif outcome.get("ok"):
                task.result = str(outcome.get("summary") or "")
                task.status = TaskStatus.completed
            else:
                task.error = str(outcome.get("error") or outcome.get("summary") or "Task failed")
                task.status = TaskStatus.failed
        else:
            await _run_task_legacy(task)
    except asyncio.CancelledError:
        task.status = TaskStatus.cancelled
        await task.events.put(_make_event("task_cancelled"))
    except Exception as exc:
        logger.exception("Task %s failed", task.task_id)
        task.status = TaskStatus.failed
        task.error = str(exc)
        await task.events.put(_make_event("task_error", error=str(exc)))
    finally:
        await task.events.put(None)


async def _run_task_legacy(task: AgentTask) -> None:
    """Legacy planner→executor path (``ASSISTANT_ORCHESTRATOR_TASK_QUEUE=0``)."""
    from agent.executor import execute_step
    from agent.planner import plan_goal

    await task.events.put(_make_event("task_start", goal=task.goal))

    loop = asyncio.get_running_loop()

    def _on_planner_relay(from_id: str, to_id: str, reason: str) -> None:
        payload = _make_event(
            "provider_relay",
            **{"from": from_id, "to": to_id, "reason": reason, "kind": "reasoning"},
        )

        async def _emit() -> None:
            await task.events.put(payload)

        loop.call_soon_threadsafe(lambda: asyncio.create_task(_emit()))

    # Planning phase
    await task.events.put(_make_event("planning", message="Analysing goal…"))
    steps = await plan_goal(
        task.goal,
        preferred=task.provider,
        preferred_model=task.model,
        preferred_api_key=task.api_key,
        preferred_base_url=task.base_url,
        on_relay=_on_planner_relay,
    )

    if not steps:
        raise ValueError("Planner returned no steps for this goal.")

    await task.events.put(
        _make_event("plan_ready", step_count=len(steps), steps=_plan_tree(steps))
    )

    results: list[dict] = []

    for step in steps:
        if task.cancel_event.is_set():
            await task.events.put(_make_event("task_cancelled"))
            task.status = TaskStatus.cancelled
            return

        await task.events.put(
            _make_event(
                "step_start",
                step=step.index,
                description=step.description,
                command_id=step.command_id,
                subtask_count=len(step.subtasks),
            )
        )

        if step.subtasks:
            result = await _run_subtasks(task, step)
        else:
            result = await asyncio.to_thread(execute_step, step)
        results.append({"step": step.index, **result})

        await task.events.put(
            _make_event(
                "step_done",
                step=step.index,
                ok=result.get("ok", False),
                data=result.get("data"),
                error=result.get("error"),
            )
        )

    summary = _build_summary(task.goal, steps, results)
    task.result = summary
    task.status = TaskStatus.completed
    await task.events.put(_make_event("task_complete", result=summary))


async def _run_subtasks(task: AgentTask, step) -> dict:
    """Run a step's subtasks sequentially, streaming subtask events.

    Returns an aggregate step result: ``ok`` is True only if every subtask
    succeeded; ``data`` collects each subtask outcome; ``error`` is the first
    failure message (if any).
    """
    from agent.executor import execute_subtask

    sub_results: list[dict] = []
    all_ok = True
    first_error: str | None = None

    for sub in step.subtasks:
        if task.cancel_event.is_set():
            break

        await task.events.put(
            _make_event(
                "subtask_start",
                step=step.index,
                subtask=sub.index,
                description=sub.description,
                command_id=sub.command_id,
            )
        )

        result = await asyncio.to_thread(execute_subtask, sub)
        ok = bool(result.get("ok", False))
        all_ok = all_ok and ok
        if not ok and first_error is None:
            first_error = result.get("error") or "Subtask failed."
        sub_results.append({"subtask": sub.index, **result})

        await task.events.put(
            _make_event(
                "subtask_done",
                step=step.index,
                subtask=sub.index,
                ok=ok,
                data=result.get("data"),
                error=result.get("error"),
            )
        )

    return {
        "ok": all_ok,
        "data": {"subtasks": sub_results},
        "error": first_error,
    }


def _build_summary(goal: str, steps, results: list[dict]) -> str:
    lines = [f"Goal: {goal}", ""]
    for step, result in zip(steps, results):
        status_icon = "✓" if result.get("ok") else "✗"
        lines.append(f"{status_icon} Step {step.index}: {step.description}")
        if not result.get("ok") and result.get("error"):
            lines.append(f"  Error: {result['error']}")
        elif result.get("ok") and result.get("data"):
            data = result["data"]
            if isinstance(data, dict):
                # Surface connector result counts and key fields in the summary
                # so the user sees what was actually retrieved or acted upon.
                if "count" in data and "files" in data:
                    lines.append(f"  Retrieved {data['count']} file(s).")
                elif "count" in data and "messages" in data:
                    lines.append(f"  Retrieved {data['count']} message(s).")
                elif "count" in data and "events" in data:
                    lines.append(f"  Retrieved {data['count']} event(s).")
                elif "count" in data and "items" in data:
                    lines.append(f"  Retrieved {data['count']} item(s).")
                elif "count" in data and "channels" in data:
                    lines.append(f"  Found {data['count']} channel(s).")
                elif "count" in data and "results" in data:
                    lines.append(f"  Found {data['count']} result(s).")
                elif "sent" in data and data.get("sent"):
                    lines.append("  Message sent successfully.")
                elif "event_id" in data:
                    lines.append(f"  Event created/updated (id: {data['event_id']}).")
                elif "folder_id" in data or "id" in data:
                    lines.append(f"  Item created (id: {data.get('folder_id') or data.get('id')}).")
                elif (
                    "deleted" in data
                    or "deleted_path" in data
                    or "deleted_id" in data
                ):
                    label = (
                        data.get("deleted")
                        or data.get("deleted_path")
                        or data.get("deleted_id", "")
                    )
                    lines.append(f"  Deleted: {label}.")
                elif "destination" in data:
                    lines.append(f"  Moved to: {data['destination']}.")
    return "\n".join(lines)


async def stream_task_events(task: AgentTask) -> AsyncGenerator[str, None]:
    """Yield Server-Sent Event strings for the task."""
    while True:
        try:
            event_json = await asyncio.wait_for(task.events.get(), timeout=30.0)
        except asyncio.TimeoutError:
            yield "data: " + _make_event("heartbeat") + "\n\n"
            continue
        if event_json is None:
            break
        yield "data: " + event_json + "\n\n"
