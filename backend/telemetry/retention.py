"""Scheduled trim for opt-in telemetry SQLite rows."""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from .repository import TelemetryRepository

logger = logging.getLogger(__name__)

TELEMETRY_RETENTION_DAYS = 90


def telemetry_db_path() -> Path:
    raw = os.environ.get("TELEMETRY_SQLITE_PATH", "").strip()
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parent / "data" / "telemetry.sqlite"


def prune_telemetry_older_than(days: int = TELEMETRY_RETENTION_DAYS) -> dict[str, int]:
    """
    Delete telemetry events and feedback older than ``days``.

    Returns per-table delete counts. Safe when the DB file is missing (no-op).
    """
    cutoff_ms = int((time.time() - days * 86_400) * 1000)
    repo = TelemetryRepository(telemetry_db_path())
    removed = repo.delete_older_than_ms(cutoff_ms)
    if any(removed.values()):
        logger.info("telemetry retention pruned rows older than %d days: %s", days, removed)
    return removed
