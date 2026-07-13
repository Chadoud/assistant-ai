"""_find_open_task: short spoken phrases should still resolve to a task."""

from __future__ import annotations

import sys
import types

import actions.recall_tools as rt


def _stub_tasks_store(monkeypatch, tasks: list[dict]) -> None:
    module = types.ModuleType("tasks_store")
    module.list_tasks = lambda include_completed=False: list(tasks)  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "tasks_store", module)


def test_find_open_task_substring_match(monkeypatch):
    _stub_tasks_store(monkeypatch, [
        {"id": 7, "description": "Shooting at 16:00"},
        {"id": 8, "description": "Email the landlord"},
    ])
    match = rt._find_open_task("shooting")
    assert match is not None and match["id"] == 7


def test_find_open_task_exact_still_wins(monkeypatch):
    _stub_tasks_store(monkeypatch, [
        {"id": 1, "description": "Call mum"},
        {"id": 2, "description": "Call mum back at noon"},
    ])
    match = rt._find_open_task("Call mum")
    assert match is not None and match["id"] == 1


def test_find_open_task_ambiguous_substring_returns_none(monkeypatch):
    # Two tasks contain "call" — a bare substring shouldn't silently pick one.
    _stub_tasks_store(monkeypatch, [
        {"id": 1, "description": "call the bank"},
        {"id": 2, "description": "call the dentist"},
    ])
    assert rt._find_open_task("call") is None
