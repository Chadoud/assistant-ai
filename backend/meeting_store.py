"""
Meeting mode: capture a live transcript, show running notes, and on end produce a
structured summary with extracted action items and memories.

Audio capture + speech-to-text happen client-side (the renderer feeds transcript
lines here, reusing the existing voice/STT plumbing). This module owns the
session lifecycle and the end-of-meeting distillation, persisting the result as a
durable conversation so it shows up in search/recall like any other.

Active sessions live in memory (transcript can be large and is transient until the
meeting ends); the final summary + transcript are persisted via conversation_store.
"""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime
from typing import Any

from llm.complete import complete

logger = logging.getLogger(__name__)

_MAX_LINES = 2000

_SUMMARY_SYSTEM = (
    "You write concise meeting notes. Given a raw transcript, produce clear, "
    "useful notes a participant would value. Output STRICT JSON only."
)

_SUMMARY_INSTRUCTION = """Return a single JSON object with EXACTLY these keys:
{
  "title": "short meeting title",
  "overview": "2-3 sentence summary",
  "highlights": ["key point", "..."],
  "decisions": ["decision made", "..."],
  "action_items": ["concrete follow-up task", "..."]
}
Use empty arrays where nothing applies. Output JSON ONLY.

Transcript:
"""


class _Meeting:
    def __init__(self, meeting_id: str, title: str) -> None:
        self.id = meeting_id
        self.title = title
        self.lines: list[str] = []
        self.started_at = datetime.now(UTC).isoformat()


_lock = threading.Lock()
_active: dict[str, _Meeting] = {}


def start_meeting(meeting_id: str, title: str = "") -> dict[str, Any]:
    with _lock:
        _active[meeting_id] = _Meeting(meeting_id, title or "Meeting")
        m = _active[meeting_id]
    try:
        from meeting_persistence import upsert_draft

        upsert_draft(m.id, m.title, m.lines, m.started_at, m.started_at)
    except Exception:
        logger.exception("failed to persist meeting draft on start")
    return {"ok": True, "id": m.id, "title": m.title, "started_at": m.started_at}


def append_line(meeting_id: str, text: str, speaker: str | None = None) -> dict[str, Any]:
    line = (text or "").strip()
    if not line:
        return {"ok": False, "error": "empty line"}
    with _lock:
        m = _active.get(meeting_id)
        if not m:
            return {"ok": False, "error": "meeting_not_found"}
        prefix = f"{speaker}: " if speaker else ""
        m.lines.append(f"{prefix}{line}")
        if len(m.lines) > _MAX_LINES:
            m.lines = m.lines[-_MAX_LINES:]
        count = len(m.lines)
        title = m.title
        started_at = m.started_at
        lines_copy = list(m.lines)
    try:
        from datetime import UTC, datetime

        from meeting_persistence import upsert_draft

        upsert_draft(
            meeting_id,
            title,
            lines_copy,
            started_at,
            datetime.now(UTC).isoformat(),
        )
    except Exception:
        logger.exception("failed to persist meeting draft line")
    return {"ok": True, "line_count": count}


def get_live_notes(meeting_id: str, tail: int = 50) -> dict[str, Any]:
    """Return recent transcript lines as running notes (no LLM — honest live view)."""
    with _lock:
        m = _active.get(meeting_id)
        if not m:
            draft = None
            try:
                from meeting_persistence import load_draft

                draft = load_draft(meeting_id)
            except Exception:
                logger.exception("failed to load meeting draft")
            if draft:
                lines = draft.get("lines") or []
                return {
                    "ok": True,
                    "id": draft["id"],
                    "title": draft["title"],
                    "line_count": len(lines),
                    "lines": lines[-max(1, tail):],
                    "recovered": True,
                }
            return {"ok": False, "error": "meeting_not_found"}
        return {
            "ok": True,
            "id": m.id,
            "title": m.title,
            "line_count": len(m.lines),
            "lines": m.lines[-max(1, tail):],
        }


def _parse_json(raw: str) -> dict[str, Any] | None:
    from memory_extract import _parse_json_object

    return _parse_json_object(raw)


def end_meeting(meeting_id: str) -> dict[str, Any]:
    """Summarize the meeting, persist it as a conversation, and extract tasks/memories."""
    with _lock:
        m = _active.pop(meeting_id, None)
    if not m:
        return {"ok": False, "error": "meeting_not_found"}

    transcript = "\n".join(m.lines).strip()
    if len(transcript) < 40:
        return {"ok": True, "skipped": "too_short", "id": meeting_id}

    raw = complete(_SUMMARY_SYSTEM, _SUMMARY_INSTRUCTION + transcript[-12000:])
    parsed = _parse_json(raw) if raw else None

    title = (parsed or {}).get("title") or m.title
    overview = (parsed or {}).get("overview") or ""
    highlights = (parsed or {}).get("highlights") or []
    decisions = (parsed or {}).get("decisions") or []
    raw_action_items = (parsed or {}).get("action_items") or []
    action_items = [str(item).strip() for item in raw_action_items if str(item).strip()]

    # Persist as a durable conversation so the meeting is searchable/recallable.
    summary_parts = [overview]
    if highlights:
        summary_parts.append("Highlights: " + "; ".join(str(h) for h in highlights))
    if decisions:
        summary_parts.append("Decisions: " + "; ".join(str(d) for d in decisions))
    full_summary = "\n".join(p for p in summary_parts if p).strip()

    tasks_stored = 0
    memories_stored = 0
    try:
        import tasks_store
        from conversation_store import upsert_conversation
        from memory_extract import _store_memories
        from signal_quality import PROVENANCE_MEETING

        upsert_conversation(
            meeting_id,
            title=str(title)[:120],
            summary=full_summary[:2000],
            category="meeting",
            emoji="🗣️",
            messages=[{"role": "user", "content": transcript[-12000:]}],
            action_items=action_items,
        )
        for item in action_items:
            if tasks_store.task_exists(item):
                continue
            try:
                tasks_store.create_task(item, source="meeting", source_conversation_id=meeting_id)
                tasks_stored += 1
            except ValueError:
                logger.debug("skipped promotional meeting action item: %s", str(item)[:80])

        memory_items: list[dict[str, str]] = []
        if overview:
            memory_items.append(
                {
                    "category": "context",
                    "key": f"Meeting: {str(title)[:60]}",
                    "value": overview[:800],
                }
            )
        for idx, point in enumerate(highlights[:8]):
            text = str(point).strip()
            if text:
                memory_items.append(
                    {
                        "category": "notes",
                        "key": f"{str(title)[:40]} highlight {idx + 1}",
                        "value": text[:500],
                    }
                )
        for idx, decision in enumerate(decisions[:5]):
            text = str(decision).strip()
            if text:
                memory_items.append(
                    {
                        "category": "projects",
                        "key": f"{str(title)[:40]} decision {idx + 1}",
                        "value": text[:500],
                    }
                )
        memories_stored = _store_memories(memory_items, meeting_id, provenance=PROVENANCE_MEETING)
    except Exception:
        logger.exception("failed to persist meeting summary")

    try:
        from meeting_persistence import delete_draft

        delete_draft(meeting_id)
    except Exception:
        logger.exception("failed to delete meeting draft")

    return {
        "ok": True,
        "id": meeting_id,
        "title": title,
        "overview": overview,
        "highlights": highlights,
        "decisions": decisions,
        "action_items": action_items,
        "tasks_stored": tasks_stored,
        "memories_stored": memories_stored,
    }


def list_active() -> list[dict[str, Any]]:
    with _lock:
        return [
            {"id": m.id, "title": m.title, "started_at": m.started_at, "line_count": len(m.lines)}
            for m in _active.values()
        ]


def has_active(meeting_id: str) -> bool:
    """True if a meeting session with this id is currently active."""
    with _lock:
        return meeting_id in _active


def clear_all_active_meetings() -> int:
    """Drop in-memory active meeting sessions (privacy wipe)."""
    with _lock:
        count = len(_active)
        _active.clear()
    return count
