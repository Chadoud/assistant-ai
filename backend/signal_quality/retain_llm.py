"""Optional mid-band LLM judge for conversation retain scores.

Enabled only when ``EXOSITES_MEMORY_RETAIN_LLM=1``. Cached by content hash so
identical title/summary/action_items are not re-judged.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from signal_quality.retain_policy import (
    RetainVerdict,
    merge_llm_verdict,
)

logger = logging.getLogger(__name__)

_CACHE: dict[str, dict[str, Any]] = {}
_MAX_CACHE = 256

_SYSTEM = (
    "You judge whether a chat summary is worth keeping in a personal second brain. "
    "Respond with STRICT JSON only."
)

_INSTRUCTION_TEMPLATE = (
    "Given a conversation title, summary, and action items, return JSON:\n"
    '{"keep": true|false, "score": 0.0-1.0, '
    '"kind": "identity|project|commitment|preference|noise|faq|ops|other", '
    '"reason": "<=12 words", "resume_worthy": true|false}\n'
    "Rules:\n"
    "- resume_worthy=true only if a future assistant needs this to continue work "
    "(person, project, deadline, preference, commitment).\n"
    "- keep=false for capability FAQs, connection tests, one-off help with no durable fact.\n"
    "- score reflects keep confidence.\n\n"
    "Title: __TITLE__\n"
    "Summary: __SUMMARY__\n"
    "Action items: __ACTIONS__\n"
)


def _cache_key(title: str, summary: str, action_items: list[str]) -> str:
    raw = f"{title.strip()}|{summary.strip()}|{'|'.join(action_items)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _parse_json(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    candidate = fence.group(1) if fence else raw
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        data = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def judge_conversation_retain(
    *,
    title: str,
    summary: str,
    action_items: list[str],
    rule: RetainVerdict,
) -> RetainVerdict | None:
    """Call LLM and merge into rule verdict. Returns None on failure / skip."""
    key = _cache_key(title, summary, action_items)
    cached = _CACHE.get(key)
    if cached is not None:
        return merge_llm_verdict(
            rule,
            keep=bool(cached.get("keep", True)),
            score=float(cached.get("score", rule.score)),
            kind=str(cached.get("kind") or "other"),
            reason=str(cached.get("reason") or ""),
            resume_worthy=bool(cached.get("resume_worthy", False)),
        )

    try:
        from llm.complete import complete
    except Exception:
        logger.debug("retain_llm: complete unavailable", exc_info=True)
        return None

    prompt = (
        _INSTRUCTION_TEMPLATE.replace("__TITLE__", (title or "")[:200])
        .replace("__SUMMARY__", (summary or "")[:800])
        .replace("__ACTIONS__", json.dumps(action_items[:12], ensure_ascii=False))
    )
    raw = complete(_SYSTEM, prompt)
    parsed = _parse_json(raw or "")
    if not parsed:
        return None

    payload = {
        "keep": bool(parsed.get("keep", True)),
        "score": float(parsed.get("score", rule.score)),
        "kind": str(parsed.get("kind") or "other")[:40],
        "reason": str(parsed.get("reason") or "")[:80],
        "resume_worthy": bool(parsed.get("resume_worthy", False)),
    }
    if len(_CACHE) >= _MAX_CACHE:
        # Drop an arbitrary old entry
        _CACHE.pop(next(iter(_CACHE)), None)
    _CACHE[key] = payload

    return merge_llm_verdict(
        rule,
        keep=payload["keep"],
        score=payload["score"],
        kind=payload["kind"],
        reason=payload["reason"],
        resume_worthy=payload["resume_worthy"],
    )


def clear_retain_llm_cache() -> None:
    _CACHE.clear()
