"""Persisted job source chips — mirrors frontend ``SortJobSourceId``."""

from __future__ import annotations

VALID_JOB_IMPORT_SOURCES = frozenset(
    {
        "local",
        "gmail",
        "google-drive",
        "dropbox",
        "onedrive",
        "outlook",
        "s3",
        "slack",
        "icloud",
        "infomaniak",
        "infomaniak-mail",
    }
)


def apply_job_import_sources(job: dict, sources: list[str] | None) -> None:
    """Merge validated source ids onto a job dict (order preserved, deduped)."""
    if not sources:
        return
    cleaned: list[str] = []
    for raw in sources:
        if not isinstance(raw, str):
            continue
        sid = raw.strip()
        if sid and sid in VALID_JOB_IMPORT_SOURCES and sid not in cleaned:
            cleaned.append(sid)
    if not cleaned:
        return
    existing = [s for s in (job.get("job_import_sources") or []) if isinstance(s, str)]
    merged: list[str] = []
    for sid in [*existing, *cleaned]:
        if sid not in merged:
            merged.append(sid)
    job["job_import_sources"] = merged
