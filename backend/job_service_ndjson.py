"""Optional NDJSON debug appenders for classify + job pipeline (guarded by constants)."""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)


def append_classify_debug_ndjson(
    *,
    job_id: str,
    file_path: str,
    payload: dict,
) -> None:
    from constants import APP_STATE_DIR, CLASSIFY_DEBUG_LOG

    if not CLASSIFY_DEBUG_LOG:
        return
    try:
        log_path = APP_STATE_DIR / "classify_debug.ndjson"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"job_id": job_id, "path": file_path, **payload}, ensure_ascii=False) + "\n"
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line)
    except Exception as exc:  # noqa: BLE001 — debug logging must never break the pipeline
        logger.debug("classify_debug ndjson append failed (job=%s): %s", job_id, exc)


def append_job_pipeline_event_ndjson(
    *,
    job_id: str,
    file_path: str,
    phase: str | None,
    event: str,
    error: str,
) -> None:
    from constants import APP_STATE_DIR, JOB_PIPELINE_DEBUG_LOG

    if not JOB_PIPELINE_DEBUG_LOG:
        return
    try:
        log_path = APP_STATE_DIR / "job_pipeline.ndjson"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(
            {
                "job_id": job_id,
                "path": file_path,
                "phase": phase,
                "event": event,
                "error": error[:2000],
            },
            ensure_ascii=False,
        ) + "\n"
        with log_path.open("a", encoding="utf-8") as f:
            f.write(line)
    except Exception as exc:  # noqa: BLE001 — debug logging must never break the pipeline
        logger.debug("job_pipeline ndjson append failed (job=%s): %s", job_id, exc)
