"""Privacy / data-subject routes (local wipe)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from privacy_wipe import wipe_local_user_data

router = APIRouter(prefix="/v1/privacy", tags=["privacy"])


class LocalWipeBody(BaseModel):
    confirmed: bool = Field(..., description="Must be true to execute wipe")


@router.post("/wipe-local")
def wipe_local(body: LocalWipeBody) -> dict:
    """Erase locally stored assistant data on this device (memory, chats, tasks, activity)."""
    if not body.confirmed:
        return {"ok": False, "detail": "confirmed must be true"}
    return wipe_local_user_data()
