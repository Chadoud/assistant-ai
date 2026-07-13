"""Tests for second-brain noise cleanup."""

from __future__ import annotations

import importlib
from datetime import UTC, datetime

import assistant_memory
import tasks_store


def _insert_mail_task(description: str, external_id: str) -> None:
    now = datetime.now(UTC).isoformat()
    with tasks_store._connect() as conn:  # noqa: SLF001 — test fixture
        conn.execute(
            """
            INSERT INTO tasks
                (description, due_at, priority, source, source_conversation_id,
                 external_id, created_at, updated_at)
            VALUES (?, NULL, 'normal', 'gmail', NULL, ?, ?, ?)
            """,
            (description, external_id, now, now),
        )
        conn.commit()


def test_create_task_rejects_promotional_gmail(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    importlib.reload(tasks_store)
    with __import__("pytest").raises(ValueError, match="promotional"):
        tasks_store.create_task(
            "50% off sale — limited time only",
            source="gmail",
            external_id="gmail:mail:x",
        )


def test_cleanup_noise_tasks_removes_promo_mail(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    importlib.reload(tasks_store)

    _insert_mail_task("50% off sale — limited time only", "gmail:mail:1")
    tasks_store.create_task(
        "Follow up with Alice on contract",
        source="gmail",
        external_id="gmail:mail:2",
    )

    dry = tasks_store.cleanup_noise_tasks(dry_run=True)
    assert dry["candidates"] == 1

    result = tasks_store.cleanup_noise_tasks(dry_run=False)
    assert result["removed"] == 1
    remaining = tasks_store.list_tasks(include_completed=False)
    assert len(remaining) == 1
    assert "Alice" in remaining[0]["description"]


def test_cleanup_second_brain_combined(tmp_path, monkeypatch):
    monkeypatch.setenv("EXOSITES_DATA_DIR", str(tmp_path))
    importlib.reload(assistant_memory)
    importlib.reload(tasks_store)

    assistant_memory.update_memory(
        "context",
        "Promo",
        "Limited time 50% off newsletter",
        source="auto",
        reviewed=False,
        skip_signal_check=True,
    )
    _insert_mail_task("Flash sale today only — 50% off", "gmail:mail:9")

    from second_brain_cleanup import cleanup_second_brain_noise

    preview = cleanup_second_brain_noise(dry_run=True)
    assert preview["total_candidates"] >= 2

    done = cleanup_second_brain_noise(dry_run=False)
    assert done["total_removed"] >= 2
