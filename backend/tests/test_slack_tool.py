"""Tests for Slack connector error mapping."""

from __future__ import annotations

from actions import slack_tool


def test_friendly_slack_error_missing_scope() -> None:
    msg = slack_tool._friendly_slack_error("Slack API error: missing_scope")
    assert "Disconnect Slack" in msg
    assert "External sources" in msg


def test_friendly_slack_error_not_authed() -> None:
    msg = slack_tool._friendly_slack_error("Slack API error: not_authed")
    assert "Connect Slack" in msg
