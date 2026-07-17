"""No tool may be SENSITIVE without APPROVAL (fake verbal confirm, no Allow UI)."""

from __future__ import annotations

from orchestrator.policy import policy_block_result
from tool_registry.handlers import HANDLERS
from tool_registry.risk_tiers import (
    APPROVAL_TOOLS,
    BLOCKED_TOOLS,
    CONNECTOR_TOOLS,
    SAFE_TOOLS,
    Risk,
    classify,
)


def test_no_handler_dead_zone():
    """Every non-connector handler is SAFE, APPROVAL, or BLOCKED — never stranded SENSITIVE."""
    stranded: list[str] = []
    for name in HANDLERS:
        if name in CONNECTOR_TOOLS:
            continue
        risk = classify(name, {})
        if risk is Risk.SENSITIVE and name not in APPROVAL_TOOLS:
            stranded.append(name)
        if (
            name not in SAFE_TOOLS
            and name not in APPROVAL_TOOLS
            and name not in BLOCKED_TOOLS
            and name not in CONNECTOR_TOOLS
        ):
            # Fail-closed classify → SENSITIVE without an allowlist entry
            if name not in stranded:
                stranded.append(name)
    assert stranded == [], f"dead-zone tools (SENSITIVE∉APPROVAL): {stranded}"


def test_list_tasks_not_policy_blocked():
    assert (
        policy_block_result(
            "list_tasks",
            {},
            allow_sensitive=False,
            approved_tool=False,
        )
        is None
    )


def test_search_tools_not_policy_blocked():
    for name in (
        "search_memories",
        "search_conversations",
        "search_activity",
        "search_everything",
        "run_startup_briefing",
    ):
        assert name in SAFE_TOOLS
        assert (
            policy_block_result(name, {}, allow_sensitive=False, approved_tool=False) is None
        ), name


def test_create_task_and_save_memory_are_approval_tools():
    assert "create_task" in APPROVAL_TOOLS
    assert "complete_task" in APPROVAL_TOOLS
    assert "save_memory" in APPROVAL_TOOLS
    assert "schedule_reminder" in APPROVAL_TOOLS
    assert "system_volume" in APPROVAL_TOOLS
    assert "start_codegen_studio" in APPROVAL_TOOLS


def test_create_task_blocks_without_approval_allows_with():
    blocked = policy_block_result(
        "create_task",
        {"description": "buy milk"},
        allow_sensitive=False,
        approved_tool=False,
    )
    assert blocked is not None
    assert blocked.get("ok") is False
    assert (
        policy_block_result(
            "create_task",
            {"description": "buy milk"},
            allow_sensitive=False,
            approved_tool=True,
        )
        is None
    )


def test_save_memory_blocks_without_approval_allows_with():
    blocked = policy_block_result(
        "save_memory",
        {"key": "k", "value": "v"},
        allow_sensitive=False,
        approved_tool=False,
    )
    assert blocked is not None
    assert (
        policy_block_result(
            "save_memory",
            {"key": "k", "value": "v"},
            allow_sensitive=False,
            approved_tool=True,
        )
        is None
    )
