"""Tests for the durable conversation store + search."""

from __future__ import annotations

import importlib

import pytest


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import conversation_store

    importlib.reload(conversation_store)
    return conversation_store


def test_upsert_and_get(store):
    store.upsert_conversation(
        "c1",
        title="Trip planning",
        summary="Discussed flights to Lisbon in July.",
        category="planning",
        emoji="✈️",
        messages=[{"role": "user", "content": "book flights"}],
        action_items=["Book Lisbon flights"],
    )
    convo = store.get_conversation("c1")
    assert convo is not None
    assert convo["title"] == "Trip planning"
    assert convo["action_items"] == ["Book Lisbon flights"]
    assert convo["messages"][0]["content"] == "book flights"


def test_upsert_preserves_created_at(store):
    first = store.upsert_conversation("c1", title="v1")
    created = first["created_at"]
    second = store.upsert_conversation("c1", title="v2")
    assert second["created_at"] == created
    assert second["title"] == "v2"


def test_blank_id_rejected(store):
    with pytest.raises(ValueError):
        store.upsert_conversation("  ", title="x")


def test_search_ranks_by_overlap(store):
    store.upsert_conversation("c1", title="Lisbon trip", summary="flights and hotels")
    store.upsert_conversation("c2", title="Budget review", summary="quarterly spend")
    results = store.search_conversations("lisbon flights", limit=5)
    assert results
    assert results[0]["id"] == "c1"


def test_search_empty_returns_recent(store):
    store.upsert_conversation("c1", title="A")
    store.upsert_conversation("c2", title="B")
    results = store.search_conversations("", limit=5)
    assert len(results) == 2


def test_delete(store):
    store.upsert_conversation("c1", title="x")
    assert store.delete_conversation("c1") is True
    assert store.get_conversation("c1") is None


def test_search_without_embeddings_preserves_lexical_order(store, monkeypatch):
    """When Ollama is absent the helper returns None → byte-identical lexical order."""
    import semantic_rerank

    monkeypatch.setattr(semantic_rerank, "_embed", lambda *a, **k: None)
    store.upsert_conversation("c1", title="Lisbon trip", summary="flights and hotels")
    store.upsert_conversation("c2", title="Budget review", summary="quarterly spend")
    results = store.search_conversations("lisbon flights", limit=5)
    assert results[0]["id"] == "c1"


def test_search_embeddings_can_reorder(store, monkeypatch):
    """Mocked embeddings that favor the 'launch' convo lift it above the lexical top."""
    import semantic_rerank

    store.upsert_conversation("c1", title="Launch plan", summary="shipping the product")
    store.upsert_conversation("c2", title="Shipping notes", summary="logistics and couriers")

    # Query overlaps c2 lexically ("shipping"), but embeddings rank c1 (launch) first.
    def fake_embed(_model, text):
        t = text.lower()
        if "launch" in t or "did we say about shipping" in t:
            return [1.0, 0.0]
        return [0.0, 1.0]

    monkeypatch.setattr(semantic_rerank, "_embed", fake_embed)
    results = store.search_conversations("what did we say about shipping", limit=5)
    assert results[0]["id"] == "c1"


def test_upsert_scores_agent_retry_as_forget(store):
    row = store.upsert_conversation(
        "c1",
        title="Please retry this autonomously: find my latest invoices",
        summary="",
    )
    assert row["retain_tier"] == "forget"
    assert row["ephemeral"] is True
    assert row["last_judged_at"]


def test_map_eligible_filters_noise(store):
    store.upsert_conversation("noise", title="What can Exo do?", summary="")
    store.upsert_conversation(
        "keep",
        title="CV Review",
        summary="User shared a detailed CV for a software engineer role in Geneva.",
        action_items=["Update LinkedIn"],
        memory_link_count=2,
    )
    mapped = store.list_conversations(limit=20, map_eligible=True)
    ids = {r["id"] for r in mapped}
    assert "keep" in ids
    assert "noise" not in ids


def test_pin_makes_map_eligible(store):
    store.upsert_conversation("c1", title="Can you hear me?", summary="")
    assert store.list_conversations(map_eligible=True) == []
    pinned = store.set_conversation_pinned("c1", True)
    assert pinned is not None
    assert pinned["pinned"] is True
    assert pinned["retain_tier"] == "durable"
    assert any(r["id"] == "c1" for r in store.list_conversations(map_eligible=True))
