"""In-memory codegen session registry with optional JSON persistence."""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

STUDIO_ROOT = Path.home() / ".ai-manager" / "studio"
PERSIST_PATH = STUDIO_ROOT / "sessions.json"
# Cap the persisted registry so sessions.json cannot grow unboundedly.
MAX_PERSISTED_SESSIONS = 30


class SessionStatus(str, Enum):
    queued = "queued"
    planning = "planning"
    scaffolding = "scaffolding"
    generating = "generating"
    installing = "installing"
    starting = "starting"
    verifying = "verifying"
    ready = "ready"
    failed = "failed"
    cancelled = "cancelled"


@dataclass
class CodegenSession:
    session_id: str
    goal: str
    status: SessionStatus = SessionStatus.queued
    project_path: str | None = None
    preview_url: str | None = None
    stack_label: str | None = None
    install_command: str | None = None
    dev_command: str | None = None
    files_written: int = 0
    error: str | None = None
    log_tail: str = ""
    plan_steps: list[dict[str, str]] = field(default_factory=list)
    # Self-repair loop state — survives renderer reloads so the budget is real.
    repair_attempts: int = 0
    llm_repair_attempts: int = 0
    last_error_fingerprint: str = ""
    last_repair_strategy: str = ""
    provider: str = "ollama"
    model: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    events: Any = field(default_factory=lambda: __import__("asyncio").Queue(maxsize=256))
    cancel_event: Any = field(default_factory=__import__("asyncio").Event)


_sessions: dict[str, CodegenSession] = {}


def studio_dir(session_id: str) -> Path:
    return STUDIO_ROOT / session_id


def create_follow_up_session(
    goal: str,
    prior_session_id: str,
    *,
    provider: str = "ollama",
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> CodegenSession:
    """Reuse an existing studio project directory for iterative edits."""
    parent = get_session(prior_session_id)
    if not parent or not parent.project_path or not Path(parent.project_path).is_dir():
        return create_session(
            goal,
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )
    session_id = str(uuid.uuid4())
    session = CodegenSession(
        session_id=session_id,
        goal=goal,
        project_path=str(Path(parent.project_path).resolve()),
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url,
    )
    _sessions[session_id] = session
    _persist_snapshot(session)
    return session


def create_session(
    goal: str,
    *,
    provider: str = "ollama",
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> CodegenSession:
    session_id = str(uuid.uuid4())
    root = studio_dir(session_id)
    root.mkdir(parents=True, exist_ok=True)
    session = CodegenSession(
        session_id=session_id,
        goal=goal,
        project_path=str(root.resolve()),
        provider=provider,
        model=model,
        api_key=api_key,
        base_url=base_url,
    )
    _sessions[session_id] = session
    _persist_snapshot(session)
    return session


def get_session(session_id: str) -> CodegenSession | None:
    return _sessions.get(session_id)


def list_sessions() -> list[CodegenSession]:
    return list(_sessions.values())


def _persist_snapshot(session: CodegenSession) -> None:
    try:
        STUDIO_ROOT.mkdir(parents=True, exist_ok=True)
        data: dict[str, dict] = {}
        if PERSIST_PATH.is_file():
            data = json.loads(PERSIST_PATH.read_text(encoding="utf-8"))
        # Re-insert at the end so insertion order tracks recency for pruning.
        data.pop(session.session_id, None)
        data[session.session_id] = {
            "goal": session.goal,
            "status": session.status.value,
            "project_path": session.project_path,
            "preview_url": session.preview_url,
            "stack_label": session.stack_label,
            "files_written": session.files_written,
            "plan_steps": session.plan_steps,
            "repair_attempts": session.repair_attempts,
        }
        while len(data) > MAX_PERSISTED_SESSIONS:
            data.pop(next(iter(data)))
        PERSIST_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.debug("[codegen] persist failed: %s", exc)


def load_persisted_sessions() -> None:
    """Restore session metadata on backend startup (paths only; no active processes)."""
    if not PERSIST_PATH.is_file():
        return
    try:
        data = json.loads(PERSIST_PATH.read_text(encoding="utf-8"))
        for sid, meta in data.items():
            if sid in _sessions:
                continue
            path = meta.get("project_path")
            if path and Path(path).is_dir():
                _sessions[sid] = CodegenSession(
                    session_id=sid,
                    goal=str(meta.get("goal", "")),
                    status=SessionStatus(str(meta.get("status", "ready"))),
                    project_path=path,
                    preview_url=meta.get("preview_url"),
                    stack_label=meta.get("stack_label"),
                    files_written=int(meta.get("files_written") or 0),
                    plan_steps=meta.get("plan_steps") if isinstance(meta.get("plan_steps"), list) else [],
                    repair_attempts=int(meta.get("repair_attempts") or 0),
                )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        logger.debug("[codegen] load persisted failed: %s", exc)
