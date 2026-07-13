"""Tests for prompt formatting and value truncation in assistant_memory."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def memory(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import assistant_memory

    importlib.reload(assistant_memory)
    return assistant_memory


def test_truncates_long_values_on_store(memory):
    long_value = "x" * 600
    row_id = memory.update_memory(
        "notes",
        "Long note",
        long_value,
        source="manual",
        skip_signal_check=True,
    )
    entry = memory.get_memory_entry_by_id(row_id)
    assert entry is not None
    assert len(entry["value"]) <= memory.MAX_MEMORY_VALUE_CHARS + 1
    assert entry["value"].endswith("…")


def test_format_memory_prioritizes_identity_and_caps_categories(memory):
    memory.update_memory("identity", "Job", "Engineer", source="manual", skip_signal_check=True)
    memory.update_memory("identity", "Name", "Alice", source="manual", skip_signal_check=True)
    for i in range(20):
        memory.update_memory(
            "preferences",
            f"Pref {i}",
            f"value {i}",
            source="manual",
            skip_signal_check=True,
        )

    block = memory.format_memory_for_prompt()
    assert "Name: Alice" in block
    name_pos = block.index("Name: Alice")
    job_pos = block.index("Job: Engineer")
    assert name_pos < job_pos
    assert block.count("Pref ") <= 15
    assert len(block) <= 2100

