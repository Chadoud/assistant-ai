"""Pure helpers for in-memory job dict mutations (no I/O)."""


def reset_job_to_awaiting_approval_after_session_undo(job: dict) -> None:
    """Put a completed/applied job back into review: undo apply metadata on each file row."""
    job["phase"] = "awaiting_approval"
    job["status"] = "awaiting_approval"
    job["worker_active"] = False
    job["pause_requested"] = False
    job["cancel_requested"] = False
    files = job.get("files") or []
    total = len(files)
    for f in files:
        st = f.get("status")
        if st == "done":
            f["status"] = "review_ready"
            f["dest_path"] = None
            f["entry_id"] = None
            f["error"] = None
            f["approved"] = True
        elif st == "applying":
            f["status"] = "review_ready"
            f["dest_path"] = None
            f["entry_id"] = None
            f["error"] = None
            f["approved"] = True
        elif st == "review_ready":
            f["dest_path"] = None
            f["entry_id"] = None
            if f.get("error"):
                f["error"] = None
        elif st == "error":
            f["dest_path"] = None
            f["entry_id"] = None
    job["completed"] = total
    job["last_processed_index"] = total - 1 if total > 0 else -1
