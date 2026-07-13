"""Read-only API for second-brain visualizations (brain map graph sources)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from context_index import ContextIndex
from deps import get_context_index


def create_brain_router() -> APIRouter:
    router = APIRouter(tags=["brain"])

    @router.get("/brain/files")
    def brain_files(
        context_index: Annotated[ContextIndex, Depends(get_context_index)],
        max_folders: int = 35,
        max_files_per_folder: int = 15,
    ):
        """
        Folder + file knowledge from the sort pipeline's context index.

        Each sorted file contributes an excerpt so the brain map can show what
        lives on the user's machine — not just chat-derived memories.
        """
        folders = context_index.list_brain_map_files(
            max_folders=max(1, min(max_folders, 60)),
            max_files_per_folder=max(1, min(max_files_per_folder, 30)),
        )
        file_count = sum(len(f.get("files") or []) for f in folders)
        return {"folders": folders, "folder_count": len(folders), "file_count": file_count}

    return router
