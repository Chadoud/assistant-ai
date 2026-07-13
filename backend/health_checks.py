"""Readiness probes for ``GET /ready`` — dependency checks beyond shallow liveness."""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any

from llm.admission import admission_summary
from llm.ollama_client import health_check as ollama_health_check
from llm.sort_queue_health import check_sort_queue_health

logger = logging.getLogger(__name__)

_MIN_DISK_FREE_BYTES = 256 * 1024 * 1024


def _check_ollama() -> dict[str, Any]:
    return ollama_health_check()


def _user_data_dir() -> Path:
    raw = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parent


def _sqlite_path_candidates() -> list[Path]:
    root = _user_data_dir()
    names = ("memory.sqlite", "conversations.sqlite", "jobs.sqlite")
    return [root / name for name in names]


def _check_sqlite_stores() -> dict[str, Any]:
    paths = _sqlite_path_candidates()
    if not paths:
        return {"ok": True, "detail": "no_paths"}
    missing = [str(p) for p in paths if not p.exists()]
    if missing:
        return {"ok": True, "detail": "stores_not_created_yet", "missing": missing}
    unreadable = [str(p) for p in paths if p.exists() and not os.access(p, os.R_OK)]
    if unreadable:
        return {"ok": False, "detail": "unreadable", "paths": unreadable}
    return {"ok": True, "detail": "readable"}


def _check_disk_free() -> dict[str, Any]:
    try:
        root = _user_data_dir()
        usage = shutil.disk_usage(root if root.exists() else Path.home())
        free = int(usage.free)
        ok = free >= _MIN_DISK_FREE_BYTES
        return {
            "ok": ok,
            "detail": "ok" if ok else "low_disk",
            "free_bytes": free,
        }
    except Exception as exc:
        logger.warning("disk check failed: %s", exc)
        return {"ok": True, "detail": "skipped"}


def run_readiness_checks() -> dict[str, Any]:
    """
    Aggregate dependency checks for orchestration and Connection diagnostics.

    Returns:
        ``{ "status": "ok"|"degraded", "checks": { ... } }``
    """
    checks = {
        "ollama": _check_ollama(),
        "llm_admission": admission_summary(),
        "sort_queue": check_sort_queue_health(),
        "sqlite": _check_sqlite_stores(),
        "disk": _check_disk_free(),
    }
    degraded = not checks["ollama"].get("ok")
    sort_queue = checks["sort_queue"]
    if sort_queue.get("enabled") and not sort_queue.get("ok"):
        degraded = True
    if not checks["sqlite"].get("ok") or not checks["disk"].get("ok"):
        degraded = True
    status = "degraded" if degraded else "ok"
    return {"status": status, "checks": checks}
