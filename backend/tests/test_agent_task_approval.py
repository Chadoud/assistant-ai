"""Chat agent task uses the same APPROVAL consent path as voice."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import MagicMock, patch

from agent.orchestrator_runner import _build_approval_dispatch_fn
from orchestrator.agents import Step, _gate_tool_step
from orchestrator.policy import AutonomyPolicy, policy_block_result
from voice_tool_approval import VoiceToolApprovalWaiter


def test_policy_block_skips_when_approval_tool_approved():
    assert (
        policy_block_result(
            "code_runner",
            {"code": "1"},
            allow_sensitive=False,
            approved_tool=True,
        )
        is None
    )


def test_policy_block_sensitive_without_autonomous():
    blocked = policy_block_result(
        "save_memory",
        {"key": "k", "value": "v"},
        allow_sensitive=False,
        approved_tool=False,
    )
    assert blocked is not None
    assert blocked["ok"] is False


def test_gate_lets_approval_tools_reach_dispatch():
    step = Step(id=1, description="run", kind="tool", tool="code_runner", args={"code": "1"})
    assert _gate_tool_step(step, AutonomyPolicy(allow_sensitive=False), audit=None) is None


def test_gate_still_blocks_sensitive_non_approval():
    step = Step(id=1, description="mem", kind="tool", tool="save_memory", args={"key": "k"})
    blocked = _gate_tool_step(step, AutonomyPolicy(allow_sensitive=False), audit=None)
    assert blocked is not None
    assert blocked.ok is False


def test_approval_dispatch_waits_and_grants():
    async def _run() -> None:
        loop = asyncio.get_running_loop()
        waiter = VoiceToolApprovalWaiter()
        events: asyncio.Queue = asyncio.Queue()
        task = MagicMock()
        task.events = events
        task.cancel_event = asyncio.Event()
        task.allow_sensitive = False
        task.approval_waiter = waiter

        dispatch = _build_approval_dispatch_fn(task, loop, waiter)

        async def _approve_soon() -> None:
            frame = await events.get()
            payload = json.loads(frame)
            assert payload["type"] == "tool_approval_required"
            assert payload["tool"] == "screen_capture"
            waiter.resolve(payload["call_id"], True)

        approve_task = asyncio.create_task(_approve_soon())

        with patch(
            "agent.orchestrator_runner.dispatch_sync",
            return_value={"ok": True, "data": {"shot": True}},
        ) as mock_dispatch:
            result = await asyncio.to_thread(dispatch, "screen_capture", {})
            await approve_task
            assert result["ok"] is True
            mock_dispatch.assert_called_once()
            assert mock_dispatch.call_args.kwargs.get("approval_granted") is True

    asyncio.run(_run())


def test_approval_dispatch_deny():
    async def _run() -> None:
        loop = asyncio.get_running_loop()
        waiter = VoiceToolApprovalWaiter()
        events: asyncio.Queue = asyncio.Queue()
        task = MagicMock()
        task.events = events
        task.cancel_event = asyncio.Event()
        task.allow_sensitive = False
        task.approval_waiter = waiter

        dispatch = _build_approval_dispatch_fn(task, loop, waiter)

        async def _deny_soon() -> None:
            frame = await events.get()
            payload = json.loads(frame)
            waiter.resolve(payload["call_id"], False)

        deny_task = asyncio.create_task(_deny_soon())

        with patch("agent.orchestrator_runner.dispatch_sync") as mock_dispatch:
            result = await asyncio.to_thread(dispatch, "code_runner", {"code": "1"})
            await deny_task
            assert result["ok"] is False
            assert "denied" in result["error"].lower() or "approval" in result["error"].lower()
            mock_dispatch.assert_not_called()

    asyncio.run(_run())


def test_make_dispatch_fn_grants_when_approved():
    from orchestrator.agents import make_dispatch_fn

    with patch("tool_registry.dispatch_sync", return_value={"ok": True}) as mock_dispatch:
        fn = make_dispatch_fn(approval_granted=True)
        result = fn("google_workspace", {"operation": "move_mail_batch"})
        assert result["ok"] is True
        mock_dispatch.assert_called_once()
        assert mock_dispatch.call_args.kwargs.get("approval_granted") is True


def test_make_dispatch_fn_denies_nested_plan():
    from orchestrator.agents import make_dispatch_fn

    fn = make_dispatch_fn(approval_granted=True)
    result = fn("plan_and_execute", {"goal": "x"})
    assert result["ok"] is False
    assert "nested" in result["error"].lower()


def test_plan_and_execute_passes_approved_dispatch():
    from actions.agent_task import plan_and_execute

    with patch("orchestrator.orchestrate", return_value={"ok": True, "summary": "done"}):
        with patch("orchestrator.agents.make_dispatch_fn") as mock_make:
            mock_make.return_value = lambda tool, args: {"ok": True}
            out = plan_and_execute({"goal": "move spam", "_approval_granted": True})
            assert out["ok"] is True
            mock_make.assert_called_once_with(approval_granted=True)


def test_plan_and_execute_fail_closed_dispatch_without_approval():
    from actions.agent_task import plan_and_execute

    with patch("orchestrator.orchestrate", return_value={"ok": True, "summary": "x"}):
        with patch("orchestrator.agents.make_dispatch_fn") as mock_make:
            mock_make.return_value = lambda tool, args: {"ok": False}
            plan_and_execute({"goal": "move spam"})
            mock_make.assert_called_once_with(approval_granted=False)
