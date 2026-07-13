"""Tests for connect orchestrator context preparation."""

from __future__ import annotations

from actions.connect_orchestrator import prepare_connect_context, record_connect_outcome


def test_prepare_connect_context_has_connect_id():
    ctx = prepare_connect_context("google-calendar", "Google Calendar")
    assert ctx["connect_id"]
    assert isinstance(ctx["seed_history"], list)
    assert isinstance(ctx["prior_failures"], list)


def test_record_connect_outcome_failure_does_not_raise():
    record_connect_outcome("google-calendar", "Google Calendar", success=False, detail="scope missing")
