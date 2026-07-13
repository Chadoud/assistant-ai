"""Tests for integration memory loop signal gating."""

from __future__ import annotations


def test_mail_task_does_not_create_memory() -> None:
    from integration_memory_loop import maybe_remember_from_task

    count = maybe_remember_from_task(
        {
            "source": "gmail",
            "description": "50% off sale — limited time only",
        }
    )
    assert count == 0


def test_calendar_task_can_create_memory(monkeypatch) -> None:
    import assistant_memory
    from integration_memory_loop import maybe_remember_from_task

    stored: list[tuple[str, str]] = []

    def fake_update(category, key, value, **kwargs):
        stored.append((category, key))
        return 1

    monkeypatch.setattr(assistant_memory, "memory_key_exists", lambda *a, **k: False)
    monkeypatch.setattr(assistant_memory, "update_memory", fake_update)

    count = maybe_remember_from_task(
        {
            "source": "google-calendar",
            "description": "Prepare for: Quarterly planning with product team",
        }
    )
    assert count == 1
    assert stored
