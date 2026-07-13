"""Agent planner routes through the Conductor REASONING chain with failover."""

from __future__ import annotations

import asyncio
import json

import pytest

from agent import task_queue
from agent.planner import plan_goal
from llm.base import StreamError, TextDelta
from orchestrator import complete as complete_mod
from orchestrator.complete import CompletionError
from orchestrator.conductor import Candidate
from orchestrator.health import HealthRegistry


class _FakeProvider:
    def __init__(self, provider_id: str, events: list) -> None:
        self.id = provider_id
        self.supports_tools = True
        self._events = events

    def stream(self, messages, model, *, tools=None, api_key=None, base_url=None):
        yield from self._events


def _fake_candidate(provider_id: str, events: list) -> Candidate:
    return Candidate(provider_id, _FakeProvider(provider_id, events), "m", "k", None)


def _steps_json() -> str:
    return json.dumps([{"index": 1, "description": "Scaffold app", "command_id": "file_workspace"}])


def test_plan_goal_parses_conductor_response(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("agent.planner.complete", lambda *a, **k: _steps_json())

    steps = asyncio.run(
        plan_goal("build a chat app", preferred="anthropic", preferred_model="claude-opus-4-8")
    )

    assert len(steps) == 1
    assert steps[0].description == "Scaffold app"
    assert steps[0].command_id == "file_workspace"


def test_plan_goal_maps_quota_error_to_friendly_message(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*_a, **_k):
        raise CompletionError("429 RESOURCE_EXHAUSTED quota")

    monkeypatch.setattr("agent.planner.complete", _raise)

    with pytest.raises(ValueError, match="rate limits"):
        asyncio.run(plan_goal("build a chat app", preferred="gemini"))


def test_plan_goal_invokes_on_relay_callback(monkeypatch: pytest.MonkeyPatch) -> None:
    def _complete(*_a, **kwargs):
        relay = kwargs.get("on_relay")
        if relay:
            relay("gemini", "anthropic", "429 RESOURCE_EXHAUSTED")
        return _steps_json()

    monkeypatch.setattr("agent.planner.complete", _complete)
    relays: list[tuple[str, str, str]] = []

    asyncio.run(plan_goal("goal", on_relay=lambda f, t, r: relays.append((f, t, r))))

    assert relays == [("gemini", "anthropic", "429 RESOURCE_EXHAUSTED")]


def test_plan_goal_relays_on_transient_via_complete(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(complete_mod, "REGISTRY", HealthRegistry())
    cands = [
        _fake_candidate("gemini", [StreamError("429 RESOURCE_EXHAUSTED retry in 3s")]),
        _fake_candidate("anthropic", [TextDelta(_steps_json())]),
    ]
    monkeypatch.setattr("agent.planner.candidates_for", lambda *a, **k: cands)

    steps = asyncio.run(plan_goal("goal", preferred="gemini"))

    assert len(steps) == 1
    assert steps[0].description == "Scaffold app"


def test_plan_goal_passes_preferred_to_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def _capture(capability, **kwargs):
        captured["capability"] = capability
        captured.update(kwargs)
        return [_fake_candidate("anthropic", [TextDelta(_steps_json())])]

    monkeypatch.setattr("agent.planner.candidates_for", _capture)
    monkeypatch.setattr("agent.planner.complete", lambda *a, **k: _steps_json())

    asyncio.run(
        plan_goal(
            "goal",
            preferred="anthropic",
            preferred_model="claude-opus-4-8",
            preferred_api_key="sk-test",
            preferred_base_url="https://api.example",
        )
    )

    assert captured["preferred"] == "anthropic"
    assert captured["preferred_model"] == "claude-opus-4-8"
    assert captured["preferred_api_key"] == "sk-test"
    assert captured["preferred_base_url"] == "https://api.example"


def test_create_task_stores_routing_fields() -> None:
    task = task_queue.create_task(
        "build ui",
        provider="anthropic",
        model="claude-opus-4-8",
        api_key="sk-test",
        base_url=None,
    )
    assert task.provider == "anthropic"
    assert task.model == "claude-opus-4-8"
    assert task.api_key == "sk-test"


def test_agent_task_endpoint_forwards_routing(monkeypatch: pytest.MonkeyPatch) -> None:
    import pathlib
    import sys

    from fastapi.testclient import TestClient

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from main import app

    recorded: dict[str, object] = {}

    def _fake_create(goal, *, provider, model, api_key, base_url):
        recorded.update(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )
        return task_queue.create_task(
            goal,
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )

    async def _noop_bg(_task) -> None:
        return None

    monkeypatch.setattr("routes.agent_routes.create_task", _fake_create)
    monkeypatch.setattr("routes.agent_routes._run_task_bg", _noop_bg)

    client = TestClient(app)
    response = client.post(
        "/agent/task",
        json={
            "goal": "build a chat app",
            "provider": "anthropic",
            "model": "claude-opus-4-8",
            "api_key": "sk-user",
        },
    )

    assert response.status_code == 200
    assert response.json().get("task_id")
    assert recorded["provider"] == "anthropic"
    assert recorded["model"] == "claude-opus-4-8"
    assert recorded["api_key"] == "sk-user"
