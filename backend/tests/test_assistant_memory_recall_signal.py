"""Tests for memory recall signal (last_recalled_at, recall_weight, stale cleanup)."""

from __future__ import annotations

import importlib
from datetime import UTC, datetime, timedelta

import pytest


@pytest.fixture()
def memory(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXOSITES_MEMORY_RECALL_SIGNAL", "1")
    monkeypatch.setenv("EXOSITES_MEMORY_STALE_DAYS", "90")
    import assistant_memory
    import memory_search

    importlib.reload(assistant_memory)
    importlib.reload(memory_search)
    return assistant_memory, memory_search


def test_touch_memory_recall_updates_timestamp(memory):
    assistant_memory, _ = memory
    row_id = assistant_memory.update_memory(
        "notes", "fact", "likes hiking", source="auto", reviewed=False
    )
    assert assistant_memory.touch_memory_recall([row_id], source="search") == 1
    entry = assistant_memory.get_memory_entry_by_id(row_id)
    assert entry["last_recalled_at"] is not None


def test_review_bumps_recall_weight(memory):
    assistant_memory, _ = memory
    row_id = assistant_memory.update_memory(
        "notes", "fact", "likes tea", source="auto", reviewed=False
    )
    assert assistant_memory.set_memory_reviewed(row_id, True) is True
    entry = assistant_memory.get_memory_entry_by_id(row_id)
    assert entry["recall_weight"] == 1.25


def test_manual_memory_not_stale_candidate(memory):
    assistant_memory, _ = memory
    old = (datetime.now(UTC) - timedelta(days=120)).isoformat()
    row_id = assistant_memory.update_memory(
        "notes",
        "manual fact",
        "important",
        source="manual",
        skip_signal_check=True,
    )
    with assistant_memory._conn() as conn:  # noqa: SLF001
        conn.execute(
            "UPDATE memory_entries SET updated_at=? WHERE id=?",
            (old, row_id),
        )
        conn.commit()
    dry = assistant_memory.cleanup_stale_memories(dry_run=True)
    assert row_id not in dry.get("ids", [])


def test_stale_auto_memory_candidate(memory):
    assistant_memory, _ = memory
    old = (datetime.now(UTC) - timedelta(days=120)).isoformat()
    row_id = assistant_memory.update_memory(
        "context",
        "old promo hint",
        "maybe relevant",
        source="auto",
        reviewed=False,
        skip_signal_check=True,
        noise_score=0.1,
    )
    with assistant_memory._conn() as conn:  # noqa: SLF001
        conn.execute(
            "UPDATE memory_entries SET updated_at=? WHERE id=?",
            (old, row_id),
        )
        conn.commit()
    dry = assistant_memory.cleanup_stale_memories(dry_run=True)
    assert row_id in dry.get("ids", [])


def test_search_touches_recalled_rows(memory):
    assistant_memory, memory_search = memory
    assistant_memory.update_memory(
        "identity", "pet", "dog named Max", source="manual", skip_signal_check=True
    )
    results = memory_search.search_memories("dog Max", use_embeddings=False)
    assert results
    entry = assistant_memory.get_memory_entry_by_id(results[0]["id"])
    assert entry["last_recalled_at"] is not None


def test_recall_ranking_prefers_reviewed(memory):
    assistant_memory, memory_search = memory
    low_id = assistant_memory.update_memory(
        "notes", "a", "project alpha", source="auto", reviewed=False, skip_signal_check=True
    )
    high_id = assistant_memory.update_memory(
        "notes", "b", "project beta", source="auto", reviewed=False, skip_signal_check=True
    )
    assistant_memory.set_memory_reviewed(high_id, True)
    results = memory_search.search_memories("project", use_embeddings=False)
    assert results[0]["id"] == high_id
    assert low_id in [r["id"] for r in results]


def test_flag_off_skips_touch(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("EXOSITES_MEMORY_RECALL_SIGNAL", raising=False)
    import assistant_memory

    importlib.reload(assistant_memory)
    row_id = assistant_memory.update_memory("notes", "x", "value", source="manual")
    assert assistant_memory.touch_memory_recall([row_id]) == 0


def test_cleanup_second_brain_include_stale(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("EXOSITES_MEMORY_RECALL_SIGNAL", "1")
    monkeypatch.setenv("EXOSITES_MEMORY_STALE_DAYS", "1")
    import assistant_memory
    import second_brain_cleanup

    importlib.reload(assistant_memory)
    importlib.reload(second_brain_cleanup)

    old = (datetime.now(UTC) - timedelta(days=5)).isoformat()
    row_id = assistant_memory.update_memory(
        "context", "stale", "old fact", source="auto", reviewed=False, skip_signal_check=True
    )
    with assistant_memory._conn() as conn:  # noqa: SLF001
        conn.execute(
            "UPDATE memory_entries SET updated_at=? WHERE id=?",
            (old, row_id),
        )
        conn.commit()

    preview = second_brain_cleanup.cleanup_second_brain_noise(dry_run=True, include_stale=True)
    assert preview.get("memories_stale", {}).get("candidates", 0) >= 1
