"""
Load persisted jobs, normalize resumable state on startup, and provide debounced save/touch helpers.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from constants import JOB_SAVE_DEBOUNCE_SECONDS
from job_models import JobRecord
from job_store import JobStore


def load_validated_job_records(job_store: JobStore) -> dict[str, dict]:
    """Hydrate the in-memory job map from disk; skip malformed rows."""
    raw = job_store.load()
    jobs: dict[str, dict] = {}
    for job_id, payload in raw.items():
        try:
            jobs[job_id] = JobRecord.model_validate(payload).model_dump()
        except Exception:
            continue
    return jobs


def pause_interrupted_job_phases(jobs: dict[str, dict]) -> None:
    """Recover checkpointed in-progress jobs into paused state. Valid resumable phases: analyzing, applying."""
    for job in jobs.values():
        if job.get("phase") in {"analyzing", "applying"}:
            job["phase"] = "paused"
            job["status"] = "paused"
            job["pause_requested"] = True


def bootstrap_persisted_jobs(
    job_store: JobStore,
) -> tuple[dict[str, dict], Callable[..., None], Callable[..., None]]:
    """
    Load jobs, pause interrupted phases, persist once, return `(jobs, save_jobs, touch_job)`.
    """
    jobs = load_validated_job_records(job_store)
    pause_interrupted_job_phases(jobs)
    job_store.save(jobs)
    last_jobs_save_at = time.time()

    def save_jobs(*, force: bool = False) -> None:
        nonlocal last_jobs_save_at
        now = time.time()
        if not force and (now - last_jobs_save_at) < JOB_SAVE_DEBOUNCE_SECONDS:
            return
        # Do not persist ephemeral keys (e.g. browser upload staging paths).
        serializable = {
            jid: {k: v for k, v in j.items() if not str(k).startswith("_")}
            for jid, j in jobs.items()
        }
        job_store.save(serializable)
        last_jobs_save_at = now

    def touch_job(job: dict, idx: int, *, force_save: bool = False) -> None:
        job["last_processed_index"] = idx
        job["updated_at"] = time.time()
        save_jobs(force=force_save)

    return jobs, save_jobs, touch_job
