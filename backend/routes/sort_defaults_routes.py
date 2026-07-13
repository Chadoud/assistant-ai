"""Sync desktop sort defaults for voice-triggered jobs."""

from __future__ import annotations

from fastapi import APIRouter

from sort_desktop_defaults import SortDesktopDefaults, set_sort_desktop_defaults

router = APIRouter(tags=["sort"])


@router.post("/sort/desktop-defaults")
def post_sort_desktop_defaults(body: SortDesktopDefaults):
    """
    Mirror Sort-tab settings from the desktop app for voice ``start_local_file_sort``.

    The renderer POSTs whenever persisted settings change so voice sorts match the UI pipeline.
    """
    set_sort_desktop_defaults(body)
    return {"ok": True}
