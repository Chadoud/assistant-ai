"""
POST /v1/web-nav/next-action — decide the next browser action on an OAuth consent
page so the AI can complete a connection itself.

The Electron main process drives an app-owned browser window, captures the page's
interactive elements (plus an optional screenshot), and calls this endpoint to get
the single next action to perform. See ``actions/web_navigator.py`` for the brain
and its safety rules.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from actions.desktop_navigator import decide_next_desktop_action
from actions.web_navigator import decide_next_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/web-nav", tags=["web-nav"])
desktop_router = APIRouter(prefix="/v1/desktop-nav", tags=["desktop-nav"])


class NextActionRequest(BaseModel):
    provider: str = Field("", max_length=64)
    goal: str = Field("", max_length=512)
    url: str = Field("", max_length=4096)
    elements: list[dict] = Field(default_factory=list)
    history: list[str] = Field(default_factory=list, max_length=50)
    screenshot_b64: str | None = Field(default=None, max_length=12_000_000)
    screenshot_mime: str | None = Field(default=None, max_length=64)
    connect_id: str | None = Field(default=None, max_length=64)


@router.post("/next-action")
async def next_action(body: NextActionRequest) -> dict:
    return decide_next_action(body.model_dump())


class DesktopActionRequest(BaseModel):
    provider: str = Field("", max_length=64)
    label: str = Field("", max_length=64)
    goal: str = Field("", max_length=512)
    history: list[str] = Field(default_factory=list, max_length=50)
    connect_id: str | None = Field(default=None, max_length=64)
    url: str = Field(default="", max_length=4096)
    screen_text: str = Field(default="", max_length=4096)


@desktop_router.post("/next-action")
async def next_desktop_action(body: DesktopActionRequest) -> dict:
    return decide_next_desktop_action(body.model_dump())
