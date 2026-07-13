"""Phase 1 tests: provider context + 404 failover for plan_and_execute."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from actions.agent_task import plan_and_execute
from llm.base import StreamError, TextDelta
from orchestrator import complete as complete_mod
from orchestrator.capabilities import Capability
from orchestrator.complete import CompletionError, complete
from orchestrator.conductor import Candidate
from orchestrator.health import (
    HealthRegistry,
    is_failover_error,
    is_model_failover_error,
    is_provider_credential_error,
)
from provider_context import ProviderContext, inject_provider_tool_args


class _FakeProvider:
    def __init__(self, provider_id: str, events: list) -> None:
        self.id = provider_id
        self.supports_tools = True
        self._events = events

    def stream(self, messages, model, *, tools=None, api_key=None, base_url=None):
        yield from self._events


def _fake_candidate(provider_id: str, events: list) -> Candidate:
    return Candidate(provider_id, _FakeProvider(provider_id, events), "m", "k", None)


def test_is_model_failover_error_recognizes_404_model_messages() -> None:
    assert is_model_failover_error("Anthropic API error 404: model not found") is True
    assert is_model_failover_error("invalid model name claude-foo") is True
    assert is_model_failover_error("401 invalid api key") is False


def test_is_failover_error_includes_model_and_transient() -> None:
    assert is_failover_error("429 RESOURCE_EXHAUSTED") is True
    assert is_failover_error("404 model not found") is True
    assert is_failover_error("401 invalid api key") is False


def test_is_provider_credential_error_recognizes_auth_and_billing() -> None:
    assert is_provider_credential_error("Anthropic API error (401): invalid x-api-key") is True
    assert is_provider_credential_error("403 permission denied") is True
    assert is_provider_credential_error("429 RESOURCE_EXHAUSTED") is False


def test_complete_failover_on_404_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """Anthropic 404 for invalid model relays to Gemini."""
    monkeypatch.setattr(complete_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("anthropic", [StreamError("404 model not found: claude-missing")]),
        _fake_candidate("gemini", [TextDelta("planned steps")]),
    ]
    assert complete(Capability.REASONING, "sys", "goal", candidates=cands) == "planned steps"


def test_complete_still_raises_on_auth_without_failover(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(complete_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("anthropic", [StreamError("401 invalid api key")]),
        _fake_candidate("gemini", [TextDelta("should not run")]),
    ]
    with pytest.raises(CompletionError):
        complete(Capability.REASONING, "sys", "goal", candidates=cands)


def test_inject_provider_tool_args_attaches_preferred_fields() -> None:
    args = inject_provider_tool_args(
        "plan_and_execute",
        {"goal": "delete calendar events"},
        preferred="gemini",
        preferred_model="gemini-2.5-flash",
        preferred_api_key="g-key",
    )
    assert args["_preferred"] == "gemini"
    assert args["_preferred_model"] == "gemini-2.5-flash"
    assert args["_preferred_api_key"] == "g-key"


def test_plan_and_execute_uses_preferred_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    """Gemini user never calls Anthropic when Anthropic would 404."""
    captured: dict[str, str | None] = {}

    def _fake_complete(
        capability,
        system,
        user,
        *,
        preferred=None,
        candidates=None,
        on_relay=None,
        relay_kind="reasoning",
    ):
        captured["preferred"] = preferred
        if not candidates:
            raise CompletionError("no candidates")
        first = candidates[0]
        captured["first_provider"] = first.provider_id
        if first.provider_id == "anthropic":
            raise CompletionError("404 model not found")
        return '{"steps": [{"id": 1, "kind": "reason", "description": "done"}]}'

    def _fake_orchestrate(goal, **kwargs):
        reason_fn = kwargs["reason_fn"]
        reason_fn(Capability.REASONING, "planner", f"Goal: {goal}")
        return {"ok": True, "summary": "done", "steps": [], "log": []}

    monkeypatch.setattr("actions.agent_task.complete", _fake_complete)
    monkeypatch.setattr("orchestrator.orchestrate", _fake_orchestrate)

    plan_and_execute(
        {
            "goal": "delete all WORK calendar events",
            "_preferred": "gemini",
            "_preferred_model": "gemini-2.5-flash",
            "_preferred_api_key": "g-key",
        }
    )

    assert captured["preferred"] == "gemini"
    assert captured["first_provider"] == "gemini"


def test_plan_and_execute_reads_provider_context(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, str | None] = {}

    def _fake_candidates_for(capability, **kwargs):
        captured["preferred"] = kwargs.get("preferred")
        return [
            Candidate(
                "gemini",
                SimpleNamespace(id="gemini", supports_tools=True),
                kwargs.get("preferred_model") or "gemini-2.5-flash",
                kwargs.get("preferred_api_key"),
                kwargs.get("preferred_base_url"),
            )
        ]

    def _fake_complete(*_args, preferred=None, candidates=None, **_kwargs):
        captured["complete_preferred"] = preferred
        return '{"steps": []}'

    def _fake_orchestrate(_goal, **kwargs):
        kwargs["reason_fn"](Capability.REASONING, "planner", "Goal: x")
        return {"ok": True, "summary": "ok", "steps": [], "log": []}

    monkeypatch.setattr("actions.agent_task.candidates_for", _fake_candidates_for)
    monkeypatch.setattr("actions.agent_task.complete", _fake_complete)
    monkeypatch.setattr("orchestrator.orchestrate", _fake_orchestrate)

    with patch("actions.agent_task.get_provider_context") as mock_ctx:
        mock_ctx.return_value = ProviderContext(
            preferred="gemini",
            preferred_model="gemini-2.5-pro",
            preferred_api_key="from-context",
        )
        with patch("actions.agent_task.provider_context_enabled", return_value=True):
            plan_and_execute({"goal": "multi-step task"})

    assert captured["preferred"] == "gemini"
    assert captured["complete_preferred"] == "gemini"
