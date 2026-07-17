"""manage_connection must be approvable from voice (not hard-blocked by policy)."""

from orchestrator.policy import policy_block_result
from tool_registry.risk_tiers import APPROVAL_TOOLS


def test_manage_connection_is_approval_tool():
    assert "manage_connection" in APPROVAL_TOOLS


def test_manage_connection_policy_allows_after_user_approval():
    assert (
        policy_block_result(
            "manage_connection",
            {"operation": "connect", "provider": "Google Calendar"},
            allow_sensitive=False,
            approved_tool=True,
        )
        is None
    )


def test_manage_connection_policy_blocks_without_approval():
    blocked = policy_block_result(
        "manage_connection",
        {"operation": "connect", "provider": "Google Calendar"},
        allow_sensitive=False,
        approved_tool=False,
    )
    assert blocked is not None
    assert blocked.get("ok") is False
    assert "confirmation" in str(blocked.get("error", "")).lower()
