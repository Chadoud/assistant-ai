"""Tests for memory search ranking + the new memory store columns."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def mem(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import assistant_memory
    import memory_search

    importlib.reload(assistant_memory)
    importlib.reload(memory_search)
    return assistant_memory, memory_search


def test_source_and_reviewed_defaults(mem):
    assistant_memory, _ = mem
    row_id = assistant_memory.update_memory("identity", "name", "Sam")
    entries = assistant_memory.list_all_memory_scoped()
    entry = next(e for e in entries if e["id"] == row_id)
    assert entry["source"] == "manual"
    assert entry["reviewed"] is True


def test_auto_entry_unreviewed(mem):
    assistant_memory, _ = mem
    assistant_memory.update_memory(
        "projects", "current", "AI Manager", source="auto", reviewed=False
    )
    entry = assistant_memory.list_all_memory_scoped()[0]
    assert entry["source"] == "auto"
    assert entry["reviewed"] is False


def test_set_reviewed_and_edit(mem):
    assistant_memory, _ = mem
    row_id = assistant_memory.update_memory(
        "notes", "fact", "old", source="auto", reviewed=False
    )
    assert assistant_memory.set_memory_reviewed(row_id, True) is True
    assert assistant_memory.update_memory_by_id(row_id, "new value") is True
    entry = next(e for e in assistant_memory.list_all_memory_scoped() if e["id"] == row_id)
    assert entry["reviewed"] is True
    assert entry["value"] == "new value"


def test_delete_by_id(mem):
    assistant_memory, _ = mem
    row_id = assistant_memory.update_memory("context", "k", "v")
    assert assistant_memory.delete_memory_by_id(row_id) is True
    assert assistant_memory.delete_memory_by_id(row_id) is False


def test_batch_review_delete_and_restore(mem):
    assistant_memory, _ = mem
    id_a = assistant_memory.update_memory("notes", "a", "one", source="auto", reviewed=False)
    id_b = assistant_memory.update_memory("notes", "b", "two", source="auto", reviewed=False)

    review_result = assistant_memory.batch_memory_action([id_a, id_b], "review")
    assert review_result["affected"] == 2
    entries = {e["id"]: e for e in assistant_memory.list_all_memory_scoped()}
    assert entries[id_a]["reviewed"] is True
    assert entries[id_b]["reviewed"] is True

    delete_result = assistant_memory.batch_memory_action([id_a], "delete")
    assert delete_result["affected"] == 1
    assert len(delete_result["snapshots"]) == 1
    assert id_a not in {e["id"] for e in assistant_memory.list_all_memory_scoped()}

    restored = assistant_memory.restore_memory_snapshots(delete_result["snapshots"])
    assert restored == 1
    entries = {e["key"]: e for e in assistant_memory.list_all_memory_scoped()}
    assert "a" in entries
    assert entries["a"]["value"] == "one"


def test_key_exists(mem):
    assistant_memory, _ = mem
    assistant_memory.update_memory("preferences", "color", "blue")
    assert assistant_memory.memory_key_exists("preferences", "color") is True
    assert assistant_memory.memory_key_exists("preferences", "food") is False


def test_search_ranks_relevant_first(mem):
    assistant_memory, memory_search = mem
    assistant_memory.update_memory("relationships", "dog", "Rex the golden retriever")
    assistant_memory.update_memory("preferences", "coffee", "black, no sugar")
    results = memory_search.search_memories("what is my dog called", use_embeddings=False)
    assert results
    assert results[0]["key"] == "dog"


def test_search_empty_returns_recent(mem):
    assistant_memory, memory_search = mem
    assistant_memory.update_memory("notes", "a", "one")
    assistant_memory.update_memory("notes", "b", "two")
    results = memory_search.search_memories("", use_embeddings=False)
    assert len(results) == 2


def test_manual_entries_not_evicted(mem):
    assistant_memory, _ = mem
    # Manual entries must survive even past the auto-eviction cap.
    assistant_memory.update_memory("identity", "keep_me", "important", source="manual")
    for i in range(5):
        assistant_memory.update_memory("notes", f"auto_{i}", "x", source="auto", reviewed=False)
    keys = {e["key"] for e in assistant_memory.list_all_memory_scoped()}
    assert "keep_me" in keys
