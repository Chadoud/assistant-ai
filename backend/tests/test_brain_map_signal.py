"""Tests for second-brain map eligibility heuristics."""

from __future__ import annotations

import importlib

import pytest

from signal_quality.brain_map import (
    file_allowed_on_brain_map,
    task_map_eligible,
)


def test_task_map_eligible_allows_manual_and_chat():
    assert task_map_eligible("Ship the brain map", "manual") is True
    assert task_map_eligible("Follow up with Alice on the contract", "conversation") is True


def test_task_map_eligible_rejects_uber_receipt():
    desc = "[Personal] Votre course avec Uber — Pourboire inclus"
    assert task_map_eligible(desc, "gmail") is False


def test_task_map_eligible_rejects_config_snippet():
    desc = 'integration-config.json — { "_comment": "Copy from example" }'
    assert task_map_eligible(desc, "manual") is False


def test_task_map_eligible_allows_actionable_mail():
    desc = "Follow up — deadline Friday for the proposal"
    assert task_map_eligible(desc, "gmail") is True


def test_task_map_eligible_rejects_security_sign_in_alert():
    desc = "New sign-in to your OpenAI account"
    assert task_map_eligible(desc, "gmail") is False


def test_task_map_eligible_allows_sign_contract_mail():
    desc = "Please sign the contract — deadline Friday"
    assert task_map_eligible(desc, "gmail") is True


def test_file_allowed_rejects_integration_config():
    assert file_allowed_on_brain_map(
        name="integration-config.json",
        excerpt='{ "_comment": "local dev" }',
    ) is False


def test_file_allowed_rejects_raw_json_excerpt():
    assert file_allowed_on_brain_map(
        name="notes.txt",
        excerpt='{ "version": "1.0", "name": "foo" }',
    ) is False


def test_file_allowed_keeps_real_document():
    assert file_allowed_on_brain_map(
        name="contract.pdf",
        excerpt="Team contract draft for Q3",
    ) is True


@pytest.fixture()
def store(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    import tasks_store

    importlib.reload(tasks_store)
    return tasks_store


def test_cleanup_noise_tasks_removes_non_actionable_receipt(store):
    now = "2026-06-12T12:00:00+00:00"
    with store._conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            ("Votre course Uber — Pourboire", "gmail:mail:uber-cleanup", now, now),
        )
        conn.commit()
    result = store.cleanup_noise_tasks()
    assert result["removed"] == 1
    assert store.list_tasks() == []


def test_cleanup_noise_tasks_removes_security_sign_in_alert(store):
    now = "2026-06-12T12:00:00+00:00"
    with store._conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            ("New sign-in to your OpenAI account", "gmail:mail:openai-signin", now, now),
        )
        conn.commit()
    result = store.cleanup_noise_tasks()
    assert result["removed"] == 1
    assert store.list_tasks() == []


def test_list_tasks_map_eligible_filters_receipt(store):
    store.create_task("Follow up on proposal deadline", source="gmail", external_id="gmail:mail:ok")
    now = "2026-06-12T12:00:00+00:00"
    with store._conn() as conn:
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            ("Votre course Uber — Pourboire", "gmail:mail:uber", now, now),
        )
        conn.commit()

    all_tasks = store.list_tasks()
    map_tasks = store.list_tasks(map_eligible=True)
    assert len(all_tasks) == 2
    assert len(map_tasks) == 1
    assert "proposal" in map_tasks[0]["description"]
