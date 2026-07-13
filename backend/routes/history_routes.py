"""History log, undo, reassign."""

from __future__ import annotations

import pathlib
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from api_schemas import ReassignRequest, UndoRequest, UndoSessionRequest
from context_index import ContextIndex
from deps import get_context_index, get_history_log, get_jobs, get_save_jobs
from destination_path import normalize_rel_dest
from history import HistoryLog
from job_helpers import reset_job_to_awaiting_approval_after_session_undo
from sorter import sort_file, undo_sort


def create_history_router() -> APIRouter:
    router = APIRouter(tags=["history"])

    @router.post("/undo")
    def undo_entry(
        req: UndoRequest,
        history: Annotated[HistoryLog, Depends(get_history_log)],
        context_index: Annotated[ContextIndex, Depends(get_context_index)],
    ):
        entry = history.get_entry(req.entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        if entry["undone"]:
            raise HTTPException(status_code=400, detail="Already undone")

        ok = undo_sort(
            entry["source_path"],
            entry["dest_path"],
            entry["mode"],
            folder_name=str(entry.get("folder_name") or "") or None,
        )
        if ok:
            history.mark_undone(req.entry_id)
            context_index.remove_file(entry["folder_name"], entry["dest_path"])
            context_index.save()
            return {"success": True}
        raise HTTPException(status_code=500, detail="Failed to undo file operation")

    @router.post("/undo-session")
    def undo_session(
        req: UndoSessionRequest,
        history: Annotated[HistoryLog, Depends(get_history_log)],
        context_index: Annotated[ContextIndex, Depends(get_context_index)],
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
    ):
        entries = history.get_session_entries(req.session_id)
        results = []
        for entry in reversed(entries):
            ok = undo_sort(
                entry["source_path"],
                entry["dest_path"],
                entry["mode"],
                folder_name=str(entry.get("folder_name") or "") or None,
            )
            if ok:
                history.mark_undone(entry["id"])
                context_index.remove_file(entry["folder_name"], entry["dest_path"])
            results.append({"id": entry["id"], "success": ok})
        context_index.save()

        job_out: dict | None = None
        if req.job_id:
            job = jobs.get(req.job_id)
            if job and job.get("session_id") == req.session_id:
                reset_job_to_awaiting_approval_after_session_undo(job)
                save_jobs(force=True)
                job_out = job
        return {"results": results, "job": job_out}

    @router.post("/reassign")
    def reassign_file(
        req: ReassignRequest,
        history: Annotated[HistoryLog, Depends(get_history_log)],
        context_index: Annotated[ContextIndex, Depends(get_context_index)],
    ):
        entry = history.get_entry(req.entry_id)
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        if entry["undone"]:
            raise HTTPException(status_code=400, detail="Entry already undone")

        current_dest = pathlib.Path(entry["dest_path"])
        if not current_dest.exists():
            raise HTTPException(status_code=404, detail="File not found at expected destination")

        old_folder = entry["folder_name"]
        old_dest = entry["dest_path"]
        new_folder = normalize_rel_dest(req.new_folder)
        new_dest = sort_file(str(current_dest), req.output_dir, new_folder, mode="move")

        history.reassign_entry(req.entry_id, new_dest_path=new_dest, new_folder_name=new_folder)
        context_index.reassign_file(old_folder, new_folder, old_dest, new_dest)
        context_index.save()
        return {"success": True, "new_dest": new_dest, "folder": new_folder}

    @router.get("/history")
    def get_history(
        history: Annotated[HistoryLog, Depends(get_history_log)],
    ):
        return {"entries": history.all_entries()}

    return router
