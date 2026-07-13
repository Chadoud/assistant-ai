"""Tests for memory edit signal re-evaluation."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def memory(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import assistant_memory

    importlib.reload(assistant_memory)
    return assistant_memory


def test_update_memory_by_id_rejects_promotional_edit(memory):
    row_id = memory.update_memory(
        "notes",
        "Meeting note",
        "Follow up with Alice on Friday",
        source="auto",
        reviewed=False,
        skip_signal_check=True,
    )
    with pytest.raises(ValueError, match="memory_rejected"):
        memory.update_memory_by_id(row_id, "Unsubscribe anytime — special offer inside")


def test_update_memory_by_id_updates_noise_score(memory):
    row_id = memory.update_memory(
        "notes",
        "Note",
        "Personal reminder",
        source="auto",
        reviewed=False,
        skip_signal_check=True,
    )
    assert memory.update_memory_by_id(row_id, "Call dentist tomorrow") is True
    entries = memory.list_all_memory_scoped()
    row = next(e for e in entries if e["id"] == row_id)
    assert row["noise_score"] < 0.3
