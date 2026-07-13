"""Tests for memory open-target resolution and backfill."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def memory_env(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import assistant_memory
    import tasks_store

    importlib.reload(assistant_memory)
    importlib.reload(tasks_store)
    return assistant_memory, tasks_store


def test_resolve_open_target_from_linked_calendar_task(memory_env) -> None:
    assistant_memory, tasks_store = memory_env
    from memory_origin import resolve_memory_open_target
    from origin_refs import build_google_calendar_event_url

    event_id = "evt-99"
    source_url = build_google_calendar_event_url(event_id)
    task = tasks_store.create_task(
        "Prepare for: Sport Viki / Iann",
        source="google-calendar",
        external_id=f"google-calendar:cal:{event_id}",
        source_url=source_url,
    )
    row_id = assistant_memory.update_memory(
        "context",
        "Commitment: Prepare for: Sport Viki / Iann",
        "Prepare for: Sport Viki / Iann",
        source="auto",
        reviewed=False,
        provenance="chat",
        linked_task_id=task["id"],
        origin_kind="google_calendar_event",
        origin_ref=f"google-calendar:cal:{event_id}",
        origin_url=source_url,
        origin_label="Sport Viki / Iann",
    )
    entry = assistant_memory.get_memory_entry_by_id(row_id)
    assert entry is not None
    target = resolve_memory_open_target(entry, allow_backfill=False)
    assert target is not None
    assert target.url == source_url
    assert "Sport Viki" in target.label


def test_backfill_matches_prepare_for_memory_to_task(memory_env) -> None:
    assistant_memory, tasks_store = memory_env
    from memory_origin import try_backfill_memory_origin
    from origin_refs import build_google_calendar_event_url

    tasks_store.create_task(
        "Prepare for: Monday sync",
        source="google-calendar",
        external_id="google-calendar:cal:monday-1",
        source_url=build_google_calendar_event_url("monday-1"),
    )
    row_id = assistant_memory.update_memory(
        "context",
        "Prepare for: Monday sync",
        "Prepare for: Monday sync",
        source="auto",
        reviewed=False,
        provenance="chat",
    )
    entry = assistant_memory.get_memory_entry_by_id(row_id)
    assert entry is not None
    fields = try_backfill_memory_origin(entry, persist=True)
    assert fields is not None
    assert fields.get("origin_ref") == "google-calendar:cal:monday-1"
    refreshed = assistant_memory.get_memory_entry_by_id(row_id)
    assert refreshed is not None
    assert refreshed.get("origin_kind") == "google_calendar_event"
