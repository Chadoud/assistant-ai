"""Codegen session store follow-up reuse, persistence and pruning."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from codegen.session_store import (
    MAX_PERSISTED_SESSIONS,
    _persist_snapshot,
    create_follow_up_session,
    create_session,
    get_session,
    load_persisted_sessions,
    studio_dir,
)


def test_follow_up_reuses_parent_project_path(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("codegen.session_store.STUDIO_ROOT", tmp_path / "studio")
    monkeypatch.setattr("codegen.session_store.PERSIST_PATH", tmp_path / "studio" / "sessions.json")

    parent = create_session("Build chat app")
    assert parent.project_path
    Path(parent.project_path).mkdir(parents=True, exist_ok=True)
    (Path(parent.project_path) / "package.json").write_text("{}", encoding="utf-8")

    child = create_follow_up_session("Make header blue", parent.session_id)
    assert child.session_id != parent.session_id
    assert child.project_path == parent.project_path
    assert get_session(child.session_id) is not None


def test_follow_up_without_parent_creates_fresh_session(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("codegen.session_store.STUDIO_ROOT", tmp_path / "studio")
    monkeypatch.setattr("codegen.session_store.PERSIST_PATH", tmp_path / "studio" / "sessions.json")

    child = create_follow_up_session("New app", str(uuid.uuid4()))
    assert child.project_path
    assert studio_dir(child.session_id).resolve() == Path(child.project_path).resolve()


def test_persisted_sessions_are_pruned_to_cap(tmp_path, monkeypatch) -> None:
    persist_path = tmp_path / "studio" / "sessions.json"
    monkeypatch.setattr("codegen.session_store.STUDIO_ROOT", tmp_path / "studio")
    monkeypatch.setattr("codegen.session_store.PERSIST_PATH", persist_path)
    monkeypatch.setattr("codegen.session_store._sessions", {})

    first = create_session("oldest build")
    for i in range(MAX_PERSISTED_SESSIONS):
        create_session(f"build {i}")

    data = json.loads(persist_path.read_text(encoding="utf-8"))
    assert len(data) == MAX_PERSISTED_SESSIONS
    assert first.session_id not in data  # oldest entry dropped


def test_repair_attempts_survive_persist_and_reload(tmp_path, monkeypatch) -> None:
    persist_path = tmp_path / "studio" / "sessions.json"
    monkeypatch.setattr("codegen.session_store.STUDIO_ROOT", tmp_path / "studio")
    monkeypatch.setattr("codegen.session_store.PERSIST_PATH", persist_path)
    monkeypatch.setattr("codegen.session_store._sessions", {})

    session = create_session("Build app")
    session.repair_attempts = 2
    _persist_snapshot(session)

    monkeypatch.setattr("codegen.session_store._sessions", {})
    load_persisted_sessions()
    restored = get_session(session.session_id)
    assert restored is not None
    assert restored.repair_attempts == 2
