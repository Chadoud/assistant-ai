"""Tests for conversation distillation (memory + task extraction)."""

from __future__ import annotations

import importlib
import json

import pytest


@pytest.fixture()
def extract(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import assistant_memory
    import conversation_store
    import memory_extract
    import tasks_store

    importlib.reload(assistant_memory)
    importlib.reload(conversation_store)
    importlib.reload(tasks_store)
    importlib.reload(memory_extract)
    return memory_extract, assistant_memory, conversation_store, tasks_store


_FAKE_LLM_JSON = json.dumps(
    {
        "title": "Dog vet visit",
        "overview": "User scheduled a vet visit for their dog Rex.",
        "category": "personal",
        "emoji": "🐕",
        "memories": [
            {"category": "relationships", "key": "dog", "value": "Rex, a golden retriever"}
        ],
        "action_items": ["Take Rex to the vet on Friday"],
    }
)


def test_extract_persists_summary_memories_tasks(extract, monkeypatch):
    memory_extract, assistant_memory, conversation_store, tasks_store = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _FAKE_LLM_JSON)

    messages = [
        {
            "role": "user",
            "content": "My dog Rex is a golden retriever and needs a vet visit Friday.",
        },
        {"role": "assistant", "content": "Got it, I'll note that."},
    ]
    report = memory_extract.extract_and_store("conv-1", messages)

    assert report["ok"] is True
    assert report["memories_stored"] == 1
    assert report["tasks_stored"] == 1

    convo = conversation_store.get_conversation("conv-1")
    assert convo["title"] == "Dog vet visit"
    assert convo["emoji"] == "🐕"

    facts = assistant_memory.list_all_memory_scoped()
    assert any(
        f["key"] == "dog" and f["source"] == "auto" and f["reviewed"] is False
        for f in facts
    )

    tasks = tasks_store.list_tasks()
    assert any("vet" in t["description"].lower() for t in tasks)


def test_extract_dedupes_existing(extract, monkeypatch):
    memory_extract, assistant_memory, _, tasks_store = extract
    assistant_memory.update_memory("relationships", "dog", "Rex", source="manual")
    tasks_store.create_task("Take Rex to the vet on Friday")
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _FAKE_LLM_JSON)

    report = memory_extract.extract_and_store(
        "conv-2",
        [{"role": "user", "content": "Reminder about Rex and the vet on Friday please."}],
    )
    assert report["memories_stored"] == 0
    assert report["tasks_stored"] == 0


def test_extract_no_provider(extract, monkeypatch):
    memory_extract, *_ = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: None)
    report = memory_extract.extract_and_store(
        "conv-3", [{"role": "user", "content": "A reasonably long message about my work project."}]
    )
    assert report["ok"] is False
    assert report["error"] == "no_llm_provider"


def test_extract_too_short_skipped(extract):
    memory_extract, *_ = extract
    report = memory_extract.extract_and_store("conv-4", [{"role": "user", "content": "hi"}])
    assert report["skipped"] == "too_short"


_PROMO_LLM_JSON = json.dumps(
    {
        "title": "Inbox recap",
        "overview": "Listed promotional emails.",
        "category": "other",
        "emoji": "📧",
        "memories": [
            {
                "category": "notes",
                "key": "Commitment: Jouez GRATUITEMENT",
                "value": "Jouez GRATUITEMENT ce week-end ! — Découvrez le mode coopératif",
            }
        ],
        "action_items": [],
    }
)


_CONFIG_DUMP_LLM_JSON = json.dumps(
    {
        "title": "Config paste",
        "overview": "User pasted config",
        "category": "work",
        "emoji": "⚙️",
        "memories": [],
        "action_items": ['integration-config.json — { "_comment": "copy me" }'],
    }
)


def test_extract_rejects_config_dump_action_item(extract, monkeypatch):
    memory_extract, _, _, tasks_store = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _CONFIG_DUMP_LLM_JSON)

    messages = [
        {"role": "user", "content": "Here is my integration-config.json file content for the project."},
        {"role": "assistant", "content": "Noted."},
    ]
    report = memory_extract.extract_and_store("conv-config", messages)
    assert report["ok"] is True
    assert report.get("tasks_stored", 0) == 0
    assert tasks_store.list_tasks() == []


def test_extract_rejects_promotional_memories(extract, monkeypatch):
    memory_extract, assistant_memory, _, _ = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _PROMO_LLM_JSON)

    messages = [
        {"role": "user", "content": "Summarize my inbox please."},
        {"role": "assistant", "content": "Here are recent emails from your accounts."},
        {"role": "assistant", "content": "Jouez GRATUITEMENT ce week-end !"},
        {"role": "user", "content": "Ok thanks."},
    ]
    report = memory_extract.extract_and_store("conv-promo", messages)
    assert report["ok"] is True
    assert report["memories_stored"] == 0
    facts = assistant_memory.list_all_memory_scoped()
    assert not any(f["source"] == "auto" for f in facts)


def test_extract_skips_memories_on_promo_density_transcript(extract, monkeypatch):
    memory_extract, assistant_memory, _, _ = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _FAKE_LLM_JSON)

    messages = [
        {"role": "user", "content": "What did I get in email this week?"},
        {"role": "assistant", "content": "50% off everything — limited time only!"},
        {
            "role": "assistant",
            "content": (
                "Jouez GRATUITEMENT ce week-end ! — Découvrez le mode coopératif"
            ),
        },
        {"role": "assistant", "content": "Unsubscribe anytime — special offer inside"},
        {"role": "user", "content": "Ok thanks."},
    ]
    report = memory_extract.extract_and_store("conv-promo-density", messages)
    assert report.get("memories_skipped_reason") == "promo_density"
    assert report["memories_stored"] == 0
    facts = assistant_memory.list_all_memory_scoped()
    assert not any(f.get("key") == "dog" for f in facts)


def test_extract_skips_memories_on_inbox_recap_transcript(extract, monkeypatch):
    memory_extract, assistant_memory, _, _ = extract
    monkeypatch.setattr(memory_extract, "complete", lambda *a, **k: _FAKE_LLM_JSON)

    assistant_lines = [
        "Surface Go 3 — shop now",
        "Ubisoft sale this weekend",
        "OneDrive storage warning",
        "Division game update",
        "Avatar game launch",
        "Discount on editions",
        "Free weekend play",
        "Another promo subject line",
    ]
    messages = [{"role": "assistant", "content": line} for line in assistant_lines]
    messages.insert(
        0,
        {
            "role": "user",
            "content": "Show me my inbox highlights from this week please.",
        },
    )

    report = memory_extract.extract_and_store("conv-recap", messages)
    assert report.get("memories_skipped_reason") == "recap_shape"
    assert report["memories_stored"] == 0
    facts = assistant_memory.list_all_memory_scoped()
    assert not any(f.get("key") == "dog" for f in facts)
