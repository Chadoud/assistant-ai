"""
Agent executor — runs a planned step using the tool_registry catalog.

Only commands in SAFE_COMMANDS are allowed. Sensitive tools (screen_capture,
code_runner) return errors unless called from voice with approval — dispatch_sync
handles that via approval_granted=False.
"""

from __future__ import annotations

import logging

from agent.planner import AgentStep, AgentSubtask
from tool_registry import ALL_TOOL_NAMES, dispatch_sync

logger = logging.getLogger(__name__)
SAFE_COMMANDS = ALL_TOOL_NAMES


def _run_command(cid: str | None, args: dict, description: str) -> dict:
    """Dispatch one command id through the safe catalog. Shared by steps and subtasks."""
    if cid is None:
        logger.debug("[executor] no command_id — returning description-only note")
        return {"ok": True, "data": {"note": description}}

    if cid not in SAFE_COMMANDS:
        logger.warning("[executor] unknown command cid=%r (not in safe catalog)", cid)
        return {"ok": False, "error": f"Command not in safe catalog: {cid!r}"}

    return dispatch_sync(cid, args or {}, approval_granted=False)


def execute_step(step: AgentStep) -> dict:
    """
    Execute one planned step. Returns a result dict with 'ok' and 'data'/'error'.
    This runs synchronously — wrap in asyncio.to_thread for async contexts.
    """
    logger.debug("[executor] step=%r cid=%r", step.description, step.command_id)
    return _run_command(step.command_id, step.command_args or {}, step.description)


def execute_subtask(subtask: AgentSubtask) -> dict:
    """Execute one subtask. Same contract and safety guard as :func:`execute_step`."""
    logger.debug("[executor] subtask=%r cid=%r", subtask.description, subtask.command_id)
    return _run_command(subtask.command_id, subtask.command_args or {}, subtask.description)
