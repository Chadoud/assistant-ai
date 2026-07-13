"""
Path-gated file operations under the user's home directory only.

Supported: mkdir, move, copy, rename — no delete in v1.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _home() -> Path:
    return Path.home()


def _safe_under_home(p: str) -> Path | None:
    try:
        path = Path(p).expanduser().resolve()
        if path.is_relative_to(_home()):
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
    """
    logger.debug("[action] file_workspace called args=%r", parameters)
    action = str(parameters.get("action", "")).strip().lower()
    raw_path = str(parameters.get("path", "")).strip()

    try:
        if action == "mkdir":
            if not raw_path:
                return {"ok": False, "error": "path is required"}
            dest = _safe_under_home(raw_path)
            if not dest:
                return {"ok": False, "error": "path must be under home directory"}
            dest.mkdir(parents=True, exist_ok=True)
            return {"ok": True, "data": {"created": str(dest)}}

        if action == "rename":
            new_name = str(parameters.get("new_name", "")).strip()
            if not raw_path or not new_name:
                return {"ok": False, "error": "path and new_name are required"}
            src = _safe_under_home(raw_path)
            if not src or not src.exists():
                return {"ok": False, "error": "source path invalid or not under home"}
            parent = src.parent
            dst = parent / new_name
            try:
                dst_resolved = dst.resolve()
                if not dst_resolved.is_relative_to(_home()):
                    return {"ok": False, "error": "target stays outside home"}
            except ValueError:
                return {"ok": False, "error": "invalid target path"}
            src.rename(dst)
            return {"ok": True, "data": {"renamed_to": str(dst)}}

        if action in {"move", "copy"}:
            dest_raw = str(parameters.get("destination", "")).strip()
            if not raw_path or not dest_raw:
                return {"ok": False, "error": "path and destination are required"}
            src = _safe_under_home(raw_path)
            dst = _safe_under_home(dest_raw)
            if not src or not dst:
                return {"ok": False, "error": "paths must be under home directory"}
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
