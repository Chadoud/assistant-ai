"""
Path-gated file operations under the user's home directory.

When ``EXOSITES_WORKSPACE_ROOTS`` is set (colon/semicolon-separated absolute paths),
paths must also lie under one of those roots in addition to home.

Supported: mkdir, move, copy, rename — no delete in v1.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SETTINGS_SECRETS_DIRNAME = "settings_secrets_v1"


def _home() -> Path:
    return Path.home()


def _workspace_roots() -> list[Path]:
    raw = (os.environ.get("EXOSITES_WORKSPACE_ROOTS") or "").strip()
    if not raw:
        return []
    roots: list[Path] = []
    for part in raw.replace(";", ":").split(":"):
        p = part.strip()
        if not p:
            continue
        try:
            roots.append(Path(p).expanduser().resolve())
        except (OSError, ValueError):
            continue
    return roots


def _is_blocked_secrets_path(path: Path) -> bool:
    try:
        resolved = path.expanduser().resolve()
    except (OSError, ValueError):
        return True
    if resolved.name == _SETTINGS_SECRETS_DIRNAME:
        return True
    for parent in resolved.parents:
        if parent.name == _SETTINGS_SECRETS_DIRNAME:
            return True
    return False


def _safe_workspace_path(p: str) -> Path | None:
    try:
        path = Path(p).expanduser().resolve()
        if not path.is_relative_to(_home()):
            return None
        if _is_blocked_secrets_path(path):
            return None
        roots = _workspace_roots()
        if roots and not any(path.is_relative_to(root) for root in roots):
            return None
        return path
    except ValueError:
        pass
    return None


def file_workspace(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        action: mkdir | move | copy | rename
        path: primary path (directory for mkdir; source for others)
        destination: dest path for move/copy
        new_name: new basename for rename (stays in same parent)

    Without ``EXOSITES_WORKSPACE_ROOTS``, any path under the user's home is allowed
    (except application ``settings_secrets_v1`` trees). Set ``EXOSITES_WORKSPACE_ROOTS``
    to restrict mutations to specific workspace directories.
    """
    logger.debug("[action] file_workspace called args=%r", parameters)
    action = str(parameters.get("action", "")).strip().lower()
    raw_path = str(parameters.get("path", "")).strip()

    try:
        if action == "mkdir":
            if not raw_path:
                return {"ok": False, "error": "path is required"}
            dest = _safe_workspace_path(raw_path)
            if not dest:
                return {"ok": False, "error": "path must be under home and allowed workspace roots"}
            dest.mkdir(parents=True, exist_ok=True)
            return {"ok": True, "data": {"created": str(dest)}}

        if action == "rename":
            new_name = str(parameters.get("new_name", "")).strip()
            if not raw_path or not new_name:
                return {"ok": False, "error": "path and new_name are required"}
            src = _safe_workspace_path(raw_path)
            if not src or not src.exists():
                return {"ok": False, "error": "source path invalid or not allowed"}
            parent = src.parent
            dst = parent / new_name
            dst_resolved = _safe_workspace_path(str(dst))
            if not dst_resolved:
                return {"ok": False, "error": "target path not allowed"}
            src.rename(dst_resolved)
            return {"ok": True, "data": {"renamed_to": str(dst_resolved)}}

        if action in {"move", "copy"}:
            dest_raw = str(parameters.get("destination", "")).strip()
            if not raw_path or not dest_raw:
                return {"ok": False, "error": "path and destination are required"}
            src = _safe_workspace_path(raw_path)
            dst = _safe_workspace_path(dest_raw)
            if not src or not dst:
                return {"ok": False, "error": "paths must be under home and allowed workspace roots"}
            if not src.exists():
                return {"ok": False, "error": "source does not exist"}
            if action == "move":
                shutil.move(str(src), str(dst))
            else:
                if src.is_dir():
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
            return {"ok": True, "data": {"destination": str(dst)}}

        return {"ok": False, "error": f"Unknown action {action!r}; use mkdir, move, copy, rename"}
    except Exception as exc:
        logger.exception("file_workspace")
        return {"ok": False, "error": str(exc)}
