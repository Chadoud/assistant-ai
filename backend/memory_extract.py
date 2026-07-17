"""
Conversation distillation: turn raw chat turns into durable knowledge.

On conversation close/idle the renderer posts the recent turns here. We ask a
cloud LLM (via ``llm.complete``) for an Omi-style structured summary plus proposed
memories and action items, then persist them:

- the conversation summary → ``conversation_store`` (title, overview, category, emoji)
- new facts about the user → ``assistant_memory`` as source='auto', reviewed=False
- commitments / to-dos → ``tasks_store`` as source='conversation'

Everything is deduped against what already exists, and the whole job degrades to a
no-op when no LLM provider is configured (local-only users keep working).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import tasks_store
from assistant_memory import MEMORY_CATEGORIES, memory_key_exists, update_memory
from conversation_origin_catalog import (
    build_task_origin_catalog,
    catalog_from_conversation_messages,
    catalog_from_recap_messages,
    catalog_from_text_hints,
    merge_origin_catalogs,
    resolve_origin_for_memory_text,
)
from conversation_store import apply_retain_score, upsert_conversation
from llm.complete import complete
from signal_quality import (
    PROMO_DENSITY_SKIP_THRESHOLD,
    PROVENANCE_CHAT,
    PROVENANCE_MEETING,
    SignalTier,
    evaluate_memory_item,
    evaluate_text,
    looks_like_email_subject,
    looks_like_inbox_recap,
    transcript_promo_density,
)

logger = logging.getLogger(__name__)

_MAX_TURNS = 40
_MAX_TRANSCRIPT_CHARS = 12000
# Skip distill LLM when the user barely spoke (Mark-XXXIX skips per-turn < 5 chars).
_MIN_USER_SUBSTANCE_CHARS = 24

_SYSTEM_PROMPT = (
    "You distill a chat between a user and their AI assistant into structured "
    "knowledge. Extract ONLY durable, reusable facts about the USER and concrete "
    "action items the user committed to. Ignore the assistant's own statements, "
    "small talk, and one-off requests. NEVER store newsletter subjects, sale "
    "copy, promotional offers, or mailing-list content as user facts. Respond "
    "with STRICT JSON only, no prose."
)

_INSTRUCTION = """Return a single JSON object with EXACTLY these keys:
{
  "title": "short 3-6 word title for this conversation",
  "overview": "1-2 sentence summary of what was discussed/decided",
  "category": "one of: work, personal, learning, planning, support, other",
  "emoji": "a single emoji representing the topic",
  "memories": [
    {"category": "<identity|preferences|projects|context|notes|relationships|wishes>",
     "key": "short stable label", "value": "the fact",
     "origin_ref": "optional — gmail:mail:ID, google-calendar:cal:ID, or conv:ID"}
  ],
  "action_items": ["concrete task the user needs to do"]
}
Rules:
- memories: only lasting facts about the USER (their name, preferences, projects,
  people, goals). No transient context. Empty array if none.
- action_items: only things the USER must do, phrased as imperatives. Empty if none.
- Never extract action items from promotional email recaps, marketing copy, receipts,
  ride summaries, thank-you mail, or config/JSON dumps.
- Keep keys short and human-readable. Output JSON ONLY.

Conversation:
"""


def _build_transcript(messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for msg in messages[-_MAX_TURNS:]:
        role = str(msg.get("role", "")).strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                str(p.get("text", "")) for p in content if isinstance(p, dict)
            )
        text = str(content or "").strip()
        if not text:
            continue
        speaker = "User" if role == "user" else "Assistant"
        lines.append(f"{speaker}: {text}")
    transcript = "\n".join(lines)
    return transcript[-_MAX_TRANSCRIPT_CHARS:]


def _user_substance_chars(messages: list[dict[str, Any]]) -> int:
    """Count user-authored characters — cheap gate before distill LLM calls."""
    total = 0
    for msg in messages[-_MAX_TURNS:]:
        role = str(msg.get("role", "")).strip().lower()
        if role != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                str(p.get("text", "")) for p in content if isinstance(p, dict)
            )
        total += len(str(content or "").strip())
    return total


def _parse_json_object(raw: str) -> dict[str, Any] | None:
    """Extract the first balanced JSON object from an LLM response."""
    if not raw:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    candidate = fence.group(1) if fence else raw
    start = candidate.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(candidate)):
        ch = candidate[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(candidate[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _should_skip_memory_extraction(transcript: str) -> str | None:
    """Return skip reason when transcript looks like inbox recap / promo-heavy."""
    density = transcript_promo_density(transcript)
    if density >= PROMO_DENSITY_SKIP_THRESHOLD:
        return "promo_density"
    if looks_like_inbox_recap(transcript):
        return "recap_shape"
    return None


def _resolve_origin_fields(
    item: dict[str, Any],
    *,
    conversation_id: str,
    provenance: str,
    key: str,
    value: str,
    origin_catalog: list[dict[str, Any]],
) -> dict[str, Any]:
    from memory_origin import normalize_distill_origin_ref, try_backfill_memory_origin
    from origin_refs import origin_from_conversation, origin_from_meeting

    origin_ref = str(item.get("origin_ref") or "").strip()
    if origin_ref:
        fields = normalize_distill_origin_ref(origin_ref, label=value[:120])
        if fields:
            return fields
    for text in (value, key, f"{key} {value}"):
        matched = resolve_origin_for_memory_text(text, catalog=origin_catalog)
        if matched:
            return matched
    if provenance == PROVENANCE_MEETING:
        return origin_from_meeting(conversation_id, label=key[:60])
    temp = {"key": key, "value": value}
    matched_task = try_backfill_memory_origin(temp, persist=False)
    if matched_task:
        return matched_task
    return origin_from_conversation(conversation_id)


def _store_memories(
    items: list[Any],
    conversation_id: str,
    *,
    provenance: str | None = None,
    origin_catalog: list[dict[str, Any]] | None = None,
) -> int:
    stored = 0
    resolved_provenance = provenance or PROVENANCE_CHAT
    catalog = origin_catalog or []
    for item in items:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category", "")).strip().lower()
        key = str(item.get("key", "")).strip()
        value = str(item.get("value", "")).strip()
        if category not in MEMORY_CATEGORIES or not key or not value:
            continue
        if memory_key_exists(category, key) or memory_key_exists(category, key, None):
            continue
        if looks_like_email_subject(key, value):
            logger.info(
                "memory_extract_reject reason=subject_shape conversation_id=%s key=%.48r",
                conversation_id,
                key,
            )
            continue
        verdict = evaluate_memory_item(key, value, provenance=resolved_provenance)
        if verdict.tier != SignalTier.ALLOW:
            logger.info(
                "memory_extract_reject reason=%s conversation_id=%s key=%.48r",
                verdict.reason,
                conversation_id,
                key,
            )
            continue
        origin_fields = _resolve_origin_fields(
            item,
            conversation_id=conversation_id,
            provenance=resolved_provenance,
            key=key,
            value=value,
            origin_catalog=catalog,
        )
        try:
            row_id = update_memory(
                category,
                key,
                value,
                conversation_id=None,
                source="auto",
                reviewed=False,
                provenance=resolved_provenance,
                noise_score=verdict.score,
                origin_kind=origin_fields.get("origin_kind"),
                origin_ref=origin_fields.get("origin_ref"),
                origin_url=origin_fields.get("origin_url"),
                origin_label=origin_fields.get("origin_label"),
                linked_task_id=origin_fields.get("linked_task_id"),
            )
            if row_id > 0:
                from memory_origin import try_backfill_memory_origin

                try_backfill_memory_origin(
                    {
                        "id": row_id,
                        "key": key,
                        "value": value,
                        "provenance": resolved_provenance,
                        "origin_kind": origin_fields.get("origin_kind"),
                        "origin_ref": origin_fields.get("origin_ref"),
                    },
                    persist=True,
                )
            stored += 1
        except ValueError:
            continue
        except Exception:
            logger.exception("failed to store auto memory %s/%s", category, key)
    return stored


def _store_tasks(items: list[Any], conversation_id: str) -> int:
    from signal_quality import task_map_eligible

    stored = 0
    for item in items:
        description = str(item or "").strip()
        if not description or tasks_store.task_exists(description):
            continue
        if evaluate_text(description).tier == SignalTier.REJECT:
            continue
        if not task_map_eligible(description, "conversation"):
            continue
        try:
            tasks_store.create_task(
                description, source="conversation", source_conversation_id=conversation_id
            )
            stored += 1
        except Exception:
            logger.exception("failed to store extracted task")
    return stored


def extract_and_store(
    conversation_id: str,
    messages: list[dict[str, Any]],
    *,
    origin_hints: list[str] | None = None,
) -> dict[str, Any]:
    """Distill a conversation; persist summary, memories, tasks. Returns a report."""
    task_catalog = build_task_origin_catalog()
    origin_catalog = merge_origin_catalogs(
        task_catalog,
        catalog_from_conversation_messages(messages),
        catalog_from_recap_messages(messages, task_catalog),
        catalog_from_text_hints(origin_hints or []),
    )

    transcript = _build_transcript(messages)
    if len(transcript) < 40:  # nothing meaningful to distill
        return {"ok": True, "skipped": "too_short"}

    if _user_substance_chars(messages) < _MIN_USER_SUBSTANCE_CHARS:
        return {"ok": True, "skipped": "no_user_substance"}

    memories_skip_reason = _should_skip_memory_extraction(transcript)
    if memories_skip_reason:
        logger.info(
            "memory_extract skipped memories reason=%s conversation_id=%s",
            memories_skip_reason,
            conversation_id,
        )

    raw = complete(_SYSTEM_PROMPT, _INSTRUCTION + transcript)
    if not raw:
        return {"ok": False, "error": "no_llm_provider"}

    parsed = _parse_json_object(raw)
    if not parsed:
        logger.warning("memory_extract: could not parse LLM JSON")
        return {"ok": False, "error": "parse_failed"}

    title = str(parsed.get("title", "")).strip()[:120]
    overview = str(parsed.get("overview", "")).strip()[:1000]
    category = str(parsed.get("category", "")).strip()[:40] or None
    emoji = str(parsed.get("emoji", "")).strip()[:8] or None
    memories = parsed.get("memories") if isinstance(parsed.get("memories"), list) else []
    if memories_skip_reason:
        memories = []
    action_items_raw = parsed.get("action_items")
    if isinstance(action_items_raw, list):
        action_items = [str(item).strip() for item in action_items_raw if str(item).strip()]
    else:
        action_items = []

    upsert_conversation(
        conversation_id,
        title=title,
        summary=overview,
        category=category,
        emoji=emoji,
        messages=messages,
        action_items=action_items,
        memory_link_count=0,
    )

    memories_stored = _store_memories(memories, conversation_id, origin_catalog=origin_catalog)
    tasks_stored = _store_tasks(action_items, conversation_id)

    # Re-score with memory/task link counts (and optional mid-band LLM judge).
    retain_fields = _finalize_retain_score(
        conversation_id,
        title=title,
        summary=overview,
        action_items=action_items,
        messages=messages,
        memories_stored=memories_stored,
        tasks_stored=tasks_stored,
    )

    report: dict[str, Any] = {
        "ok": True,
        "title": title,
        "overview": overview,
        "category": category,
        "emoji": emoji,
        "memories_stored": memories_stored,
        "tasks_stored": tasks_stored,
        "action_items": action_items,
    }
    if retain_fields:
        report["retain_tier"] = retain_fields.get("retain_tier")
        report["retain_score"] = retain_fields.get("retain_score")
    if memories_skip_reason:
        report["memories_skipped_reason"] = memories_skip_reason
    return report


def _finalize_retain_score(
    conversation_id: str,
    *,
    title: str,
    summary: str,
    action_items: list[str],
    messages: list[dict[str, Any]],
    memories_stored: int,
    tasks_stored: int,
) -> dict[str, Any] | None:
    """Apply rule score (+ optional LLM mid-band) after distill writes."""
    from signal_quality.retain_policy import (
        LLM_MID_BAND_HIGH,
        LLM_MID_BAND_LOW,
        is_retain_llm_enabled,
        is_retain_policy_enabled,
        score_conversation,
    )

    if not is_retain_policy_enabled():
        return apply_retain_score(
            conversation_id,
            memory_link_count=memories_stored + tasks_stored,
        )

    link_count = max(0, int(memories_stored) + int(tasks_stored))
    rule = score_conversation(
        title,
        summary,
        action_item_count=len(action_items),
        memory_link_count=link_count,
        message_count=len(messages),
    )

    retain_override = None
    if (
        is_retain_llm_enabled()
        and LLM_MID_BAND_LOW <= rule.score <= LLM_MID_BAND_HIGH
        and not rule.ephemeral
    ):
        try:
            from signal_quality.retain_llm import judge_conversation_retain

            llm_verdict = judge_conversation_retain(
                title=title,
                summary=summary,
                action_items=action_items,
                rule=rule,
            )
            if llm_verdict is not None:
                from datetime import UTC, datetime

                retain_override = llm_verdict.as_dict()
                retain_override["last_judged_at"] = datetime.now(UTC).isoformat()
        except Exception:
            logger.debug("retain LLM judge skipped", exc_info=True)

    if retain_override:
        return apply_retain_score(
            conversation_id,
            memory_link_count=link_count,
            retain_override=retain_override,
        )

    return apply_retain_score(conversation_id, memory_link_count=link_count)
