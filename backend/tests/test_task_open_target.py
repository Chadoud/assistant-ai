"""Tests for task open-target resolution."""

from __future__ import annotations

import importlib
from unittest.mock import patch

import pytest


@pytest.fixture()
def tasks_env(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import tasks_store

    importlib.reload(tasks_store)
    return tasks_store


def test_resolve_task_open_target_repairs_corrupt_calendar_url(tasks_env) -> None:
    from memory_origin import resolve_task_open_target
    from origin_refs import build_google_calendar_event_url

    event_id = "47532c77545843fbb3ba6f43735e8f20260616T110000Z"
    corrupt = (
        "https://calendar.google.com/calendar/u/0/r?eid="
        "NDc1MzJjNzc1NDU4NDNmYmIzYmE2ZjQzNzM1ZThmMjAyNjA2MTZThmMjAyNjA2MTZUMTEwMDAwWiBwcmItYXJ5"
    )
    task = tasks_env.create_task(
        "Prepare for: WORK",
        source="google-calendar",
        external_id=f"google-calendar:cal:{event_id}",
        source_url=corrupt,
    )

    with patch(
        "actions.google_workspace_tool._calendar_fetch_event_html_link",
        return_value=None,
    ):
        target = resolve_task_open_target(task)

    assert target is not None
    assert target.url == build_google_calendar_event_url(event_id)

    refreshed = tasks_env.get_task(task["id"])
    assert refreshed is not None
    assert refreshed["source_url"] == target.url
