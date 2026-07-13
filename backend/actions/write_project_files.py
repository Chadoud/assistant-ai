"""
Path-safe batch file writes for Codegen Studio sessions.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from codegen.session_store import get_session, studio_dir

logger = logging.getLogger(__name__)


def _session_root(session_id: str) -> Path:
    """Project root for a session — follows follow-up reuse of parent directories."""
    session = get_session(session_id)
    if session and session.project_path:
        return Path(session.project_path).expanduser().resolve()
    return studio_dir(session_id).resolve()


def _studio_root_resolved() -> Path:
    from codegen.session_store import STUDIO_ROOT

    return STUDIO_ROOT.resolve()


def _is_under_studio(path: Path) -> bool:
    try:
        return path.is_relative_to(_studio_root_resolved())
    except ValueError:
        return False

MAX_FILES_PER_BATCH = 50
MAX_FILE_BYTES = 512 * 1024
MAX_TOTAL_BYTES = 5 * 1024 * 1024


def _safe_target(session_id: str, rel_path: str) -> Path | None:
    if not session_id or not rel_path or not rel_path.strip():
        return None
    rel = rel_path.strip().replace("\\", "/").lstrip("/")
    if ".." in rel.split("/"):
        return None
    root = _session_root(session_id)
    if not _is_under_studio(root):
        return None
    try:
        target = (root / rel).resolve()
        if target.is_relative_to(root) and _is_under_studio(target):
            return target
    except (ValueError, OSError):
        pass
    return None


def write_project_files(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        session_id: codegen session id
        files: [{ path: str, content: str }, ...]
    """
    logger.debug("[action] write_project_files session=%r", parameters.get("session_id"))
    session_id = str(parameters.get("session_id", "")).strip()
    raw_files = parameters.get("files")
    if not session_id:
        return {"ok": False, "error": "session_id is required"}
    if not isinstance(raw_files, list) or not raw_files:
        return {"ok": False, "error": "files array is required"}

    if len(raw_files) > MAX_FILES_PER_BATCH:
        return {"ok": False, "error": f"Too many files (max {MAX_FILES_PER_BATCH})"}

    written: list[str] = []
    total_bytes = 0
    for item in raw_files:
        if not isinstance(item, dict):
            continue
        rel = str(item.get("path", "")).strip()
        content = item.get("content")
        if content is None:
            continue
        text = content if isinstance(content, str) else str(content)
        size = len(text.encode("utf-8"))
        if size > MAX_FILE_BYTES:
            return {"ok": False, "error": f"File too large: {rel}"}
        total_bytes += size
        if total_bytes > MAX_TOTAL_BYTES:
            return {"ok": False, "error": "Total project size exceeds limit"}

        target = _safe_target(session_id, rel)
        if not target:
            return {"ok": False, "error": f"Invalid path: {rel}"}
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        written.append(rel)

    return {"ok": True, "data": {"written": written, "count": len(written)}}


def read_project_file(parameters: dict[str, Any]) -> dict[str, Any]:
    session_id = str(parameters.get("session_id", "")).strip()
    rel = str(parameters.get("path", "")).strip()
    target = _safe_target(session_id, rel) if session_id else None
    if not target or not target.is_file():
        return {"ok": False, "error": "File not found or path invalid"}
    try:
        text = target.read_text(encoding="utf-8")
        if len(text.encode("utf-8")) > MAX_FILE_BYTES:
            return {"ok": False, "error": "File too large to read"}
        return {"ok": True, "data": {"path": rel, "content": text}}
    except OSError as exc:
        return {"ok": False, "error": str(exc)}


def list_project_tree(parameters: dict[str, Any]) -> dict[str, Any]:
    session_id = str(parameters.get("session_id", "")).strip()
    if not session_id:
        return {"ok": False, "error": "session_id is required"}
    root = _session_root(session_id)
    if not _is_under_studio(root) or not root.is_dir():
        return {"ok": False, "error": "Session project directory missing"}

    items: list[dict[str, str]] = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and "node_modules" not in path.parts:
            rel = path.relative_to(root).as_posix()
            items.append({"path": rel, "type": "file"})
        if len(items) >= 200:
            break
    return {"ok": True, "data": {"files": items, "count": len(items)}}
