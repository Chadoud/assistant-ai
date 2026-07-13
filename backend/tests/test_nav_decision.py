"""Tests for OAuth navigation vision budget."""

from __future__ import annotations

from actions.nav_decision import (
    consume_vision_budget,
    reset_connect_vision_budget,
    vision_budget_exhausted_action,
)


def test_vision_budget_caps_per_connect_id():
    reset_connect_vision_budget("test-connect")
    assert consume_vision_budget("test-connect") is True
    for _ in range(7):
        assert consume_vision_budget("test-connect") is True
    assert consume_vision_budget("test-connect") is False


def test_vision_budget_exhausted_action_is_need_user():
    action = vision_budget_exhausted_action()
    assert action["type"] == "need_user"
    assert "Allow" in action["reason"] or "Authorize" in action["reason"]
