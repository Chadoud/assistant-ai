"""Tests for the hierarchical agent planner + task_queue streaming (cube visualizer backbone)."""

from __future__ import annotations

import asyncio
import json

import pytest

from agent.planner import AgentStep, AgentSubtask, _parse_steps
from agent.task_queue import TaskStatus, _plan_tree, create_task, run_task

# ── Planner parsing ───────────────────────────────────────────────────────────


def test_parse_steps_hierarchical_with_subtasks() -> None:
    raw = json.dumps(
        [
            {
                "index": 1,
                "description": "List documents",
                "command_id": "list_directory",
                "command_args": {"path": "/home/u/docs"},
                "subtasks": [
                    {
                        "index": 1,
                        "description": "Scan docs",
                        "command_id": "list_directory",
                        "command_args": {},
                    },
                    {
                        "index": 2,
                        "description": "Note PDFs",
                        "command_id": None,
                        "command_args": {},
                    },
                ],
            },
            {"index": 2, "description": "Summarize", "command_id": None},
        ]
    )
    steps = _parse_steps(raw)
    assert len(steps) == 2
    assert steps[0].description == "List documents"
    assert len(steps[0].subtasks) == 2
    assert steps[0].subtasks[0].description == "Scan docs"
    assert steps[0].subtasks[1].command_id is None
    # Step without a subtasks key defaults to an empty list (flat, back-compat).
    assert steps[1].subtasks == []


def test_parse_steps_flat_back_compat() -> None:
    raw = json.dumps([{"index": 1, "description": "Do thing", "command_id": None}])
    steps = _parse_steps(raw)
    assert len(steps) == 1
    assert steps[0].subtasks == []


def test_parse_subtasks_skips_malformed() -> None:
    raw = json.dumps(
        [
            {
                "index": 1,
                "description": "Step",
                "command_id": None,
                "subtasks": [
                    {"index": 1, "description": "ok"},
                    {"index": 2, "description": ""},  # empty description dropped
                    "not-an-object",  # non-dict dropped
                ],
            }
        ]
    )
    steps = _parse_steps(raw)
    assert [s.description for s in steps[0].subtasks] == ["ok"]


def test_plan_tree_serialization() -> None:
    steps = [
        AgentStep(
            index=1,
            description="Step one",
            command_id="web_search",
            subtasks=[AgentSubtask(index=1, description="sub a", command_id=None)],
        ),
        AgentStep(index=2, description="Step two", command_id=None),
    ]
    tree = _plan_tree(steps)
    assert tree == [
        {
            "index": 1,
            "description": "Step one",
            "command_id": "web_search",
            "subtasks": [{"index": 1, "description": "sub a", "command_id": None}],
        },
        {"index": 2, "description": "Step two", "command_id": None, "subtasks": []},
    ]


# ── task_queue streaming ──────────────────────────────────────────────────────


def _drain(task) -> list[dict]:
    events: list[dict] = []
    while not task.events.empty():
        raw = task.events.get_nowait()
        if raw is None:
            break
        events.append(json.loads(raw))
    return events


def test_run_task_streams_plan_tree_and_subtask_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_ORCHESTRATOR_TASK_QUEUE", "0")
    steps = [
        AgentStep(
            index=1,
            description="Gather",
            command_id=None,
            subtasks=[
                AgentSubtask(index=1, description="sub one", command_id=None),
                AgentSubtask(index=2, description="sub two", command_id=None),
            ],
        ),
        AgentStep(index=2, description="Finish", command_id=None),
    ]

    async def fake_plan(goal: str, **_kwargs):
        return steps

    monkeypatch.setattr("agent.planner.plan_goal", fake_plan)
    monkeypatch.setattr("agent.executor.execute_step", lambda step: {"ok": True, "data": {}})
    monkeypatch.setattr("agent.executor.execute_subtask", lambda sub: {"ok": True, "data": {}})

    task = create_task("organize my files")
    asyncio.run(run_task(task))
    events = _drain(task)
    by_type = [e["type"] for e in events]

    # plan_ready carries the full labeled tree up front.
    plan_ready = next(e for e in events if e["type"] == "plan_ready")
    assert plan_ready["step_count"] == 2
    assert plan_ready["steps"][0]["description"] == "Gather"
    assert len(plan_ready["steps"][0]["subtasks"]) == 2

    # Subtask events stream for the step that has subtasks.
    assert "subtask_start" in by_type
    assert "subtask_done" in by_type
    sub_starts = [e for e in events if e["type"] == "subtask_start"]
    assert {s["subtask"] for s in sub_starts} == {1, 2}
    assert all(s["step"] == 1 for s in sub_starts)

    # Terminal completion.
    assert by_type[-1] == "task_complete"


def test_run_task_step_fails_when_subtask_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_ORCHESTRATOR_TASK_QUEUE", "0")
    steps = [
        AgentStep(
            index=1,
            description="Risky",
            command_id=None,
            subtasks=[AgentSubtask(index=1, description="bad", command_id=None)],
        )
    ]

    async def fake_plan(goal: str, **_kwargs):
        return steps

    monkeypatch.setattr("agent.planner.plan_goal", fake_plan)
    monkeypatch.setattr(
        "agent.executor.execute_subtask",
        lambda sub: {"ok": False, "error": "boom"},
    )

    task = create_task("do risky thing")
    asyncio.run(run_task(task))
    events = _drain(task)

    step_done = next(e for e in events if e["type"] == "step_done")
    assert step_done["ok"] is False
    assert step_done["error"] == "boom"


def test_run_task_orchestrator_path_streams_visualizer_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Default path: task_queue delegates to orchestrator.orchestrate."""

    def fake_orchestrate(goal: str, **kwargs):
        progress = kwargs.get("progress")
        assert progress is not None
        progress("planning", {"message": "Planning steps…"})
        progress(
            "plan_ready",
            {
                "step_count": 1,
                "steps": [
                    {
                        "index": 1,
                        "description": "Gather files",
                        "command_id": "list_directory",
                        "subtasks": [],
                    }
                ],
            },
        )
        progress(
            "step_start",
            {
                "step": 1,
                "description": "Gather files",
                "command_id": "list_directory",
                "subtask_count": 0,
            },
        )
        progress("step_done", {"step": 1, "ok": True, "data": None, "error": None})
        progress("task_complete", {"result": "All done."})
        return {"ok": True, "summary": "All done."}

    monkeypatch.delenv("ASSISTANT_ORCHESTRATOR_TASK_QUEUE", raising=False)
    monkeypatch.setattr("orchestrator.orchestrate", fake_orchestrate)

    task = create_task("organize my files")
    asyncio.run(run_task(task))
    events = _drain(task)
    by_type = [e["type"] for e in events]

    assert events[0]["type"] == "task_start"
    assert "planning" in by_type
    plan_ready = next(e for e in events if e["type"] == "plan_ready")
    assert plan_ready["step_count"] == 1
    assert plan_ready["steps"][0]["description"] == "Gather files"
    assert by_type[-1] == "task_complete"
    assert task.status == TaskStatus.completed
    assert task.result == "All done."
