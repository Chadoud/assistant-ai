"""
REST endpoints for the durable conversation store + distillation.

GET    /conversations              — list (summaries, newest-first)
GET    /conversations/search?q=    — relevance-ranked search
GET    /conversations/{id}         — full conversation incl. messages
PUT    /conversations/{id}         — upsert title/summary/messages/etc.
POST   /conversations/{id}/distill — run LLM extraction (summary + memories + tasks)
DELETE /conversations/{id}         — remove
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import conversation_store
from memory_extract import extract_and_store
from telemetry.rate_limit_memory import allow

router = APIRouter(prefix="/conversations", tags=["conversations"])


class ConversationUpsertBody(BaseModel):
    title: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=4000)
    category: str | None = Field(default=None, max_length=40)
    emoji: str | None = Field(default=None, max_length=8)
    messages: list[dict[str, Any]] | None = None
    action_items: list[str] | None = None
    created_at: str | None = Field(default=None, max_length=64)


class DistillBody(BaseModel):
    messages: list[dict[str, Any]] = Field(default_factory=list)
    origin_hints: list[str] = Field(default_factory=list)


@router.get("")
def list_all(limit: int = Query(default=100, ge=1, le=500)) -> list[dict[str, Any]]:
    return conversation_store.list_conversations(limit=limit)


@router.get("/search")
def search(
    q: str = Query(default="", max_length=512),
    limit: int = Query(default=5, ge=1, le=20),
) -> list[dict[str, Any]]:
    return conversation_store.search_conversations(q, limit=limit)


@router.get("/{conversation_id}")
def get_one(conversation_id: str) -> dict[str, Any]:
    convo = conversation_store.get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return convo


@router.put("/{conversation_id}")
def upsert(conversation_id: str, body: ConversationUpsertBody) -> dict[str, Any]:
    try:
        return conversation_store.upsert_conversation(
            conversation_id,
            title=body.title,
            summary=body.summary,
            category=body.category,
            emoji=body.emoji,
            messages=body.messages,
            action_items=body.action_items,
            created_at=body.created_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{conversation_id}/distill")
def distill(conversation_id: str, body: DistillBody) -> dict[str, Any]:
    """Run extraction over the supplied turns; persists summary/memories/tasks."""
    if not allow(f"conversation_distill:{conversation_id}", 4, 3600):
        raise HTTPException(status_code=429, detail="distill_rate_limited")
    return extract_and_store(
        conversation_id,
        body.messages,
        origin_hints=body.origin_hints or None,
    )


@router.delete("/{conversation_id}")
def remove(conversation_id: str) -> dict[str, Any]:
    removed = conversation_store.delete_conversation(conversation_id)
    if not removed:
        raise HTTPException(status_code=404, detail="conversation_not_found")
    return {"ok": "true", "removed": removed}
