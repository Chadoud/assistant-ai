"""Tests for computer_use loop detection."""

from __future__ import annotations

from actions.computer_use import _history_loop_detected


def test_loop_detected_after_repeated_clicks():
    history = [
        "click: Clicking Advanced link",
        "click: Clicking Advanced link again",
    ]
    action = {"type": "click", "reason": "Clicking Advanced link once more"}
    assert _history_loop_detected(history, action) is True


def test_wait_actions_do_not_trigger_loop():
    history = ["wait: loading", "wait: still loading"]
    action = {"type": "wait", "reason": "still loading"}
    assert _history_loop_detected(history, action) is False
