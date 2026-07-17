"""Retain / forget policy for second-brain surfaces (conversations first).

Cheap rule cascade (L0/L1). Promo/spam stays in ``evaluate``; this module answers
"is this worth keeping on the map / for resume?" — not "is this promotional?"
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from enum import Enum


class RetainTier(str, Enum):
    FORGET = "forget"
    ARCHIVE = "archive"
    WORKING = "working"
    DURABLE = "durable"


class JudgedBy(str, Enum):
    RULE = "rule"
    LLM = "llm"
    USER = "user"


# Map / resume visibility threshold (plan Phase 2).
MAP_SCORE_THRESHOLD = 0.55
# Mid-band for optional LLM judge (Phase 3).
LLM_MID_BAND_LOW = 0.35
LLM_MID_BAND_HIGH = 0.70


@dataclass(frozen=True)
class RetainVerdict:
    tier: RetainTier
    score: float
    reasons: list[str] = field(default_factory=list)
    judged_by: JudgedBy = JudgedBy.RULE
    ephemeral: bool = False

    def as_dict(self) -> dict:
        return {
            "retain_tier": self.tier.value,
            "retain_score": round(float(self.score), 4),
            "retain_reasons": list(self.reasons),
            "ephemeral": bool(self.ephemeral),
            "judged_by": self.judged_by.value,
        }


_VOICE_CHECK = re.compile(
    r"^(can you hear me\??|do you hear me\??|hello\??|hi\??|hey\??|test\??|"
    r"testing\??|are you there\??)$",
    re.IGNORECASE,
)
_CAPABILITY_FAQ = re.compile(
    r"^(what can (exo|you) do\??|what (exo|you) can do\??|"
    r"what are you(r)? (capabilities|features)\??|"
    r"inquiring about exo'?s capabilities)$",
    re.IGNORECASE,
)
_AGENT_RETRY = re.compile(
    r"^please retry this( autonomously)?\s*:",
    re.IGNORECASE,
)
_UNTITLED = re.compile(r"^(new conversation|untitled( conversation)?)$", re.IGNORECASE)
_DOCUMENT_PREFIX = re.compile(r"^\[document:", re.IGNORECASE)


def is_retain_policy_enabled() -> bool:
    return os.environ.get("EXOSITES_MEMORY_RETAIN_POLICY", "1").strip() != "0"


def is_retain_llm_enabled() -> bool:
    return os.environ.get("EXOSITES_MEMORY_RETAIN_LLM", "0").strip() == "1"


def working_days_threshold() -> int:
    raw = os.environ.get("EXOSITES_MEMORY_WORKING_DAYS", "30").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 30


def map_visible(verdict: RetainVerdict, *, pinned: bool = False) -> bool:
    """Whether a conversation should appear on the brain map."""
    if pinned:
        return True
    if verdict.tier in (RetainTier.FORGET, RetainTier.ARCHIVE):
        return False
    if verdict.ephemeral:
        return False
    return verdict.score >= MAP_SCORE_THRESHOLD and verdict.tier in (
        RetainTier.WORKING,
        RetainTier.DURABLE,
    )


def prompt_eligible(verdict: RetainVerdict, *, pinned: bool = False) -> bool:
    """Stricter than map — only durable/working high-score for prompt citation."""
    if pinned:
        return True
    if verdict.tier == RetainTier.DURABLE:
        return True
    if verdict.tier == RetainTier.WORKING and verdict.score >= 0.7:
        return True
    return False


def conversation_map_eligible(
    row: dict,
    *,
    include_low_value: bool = False,
) -> bool:
    """Row-level map gate using persisted retain fields (or defaults)."""
    if include_low_value:
        return not row.get("archived_at")
    if row.get("archived_at"):
        return False
    if row.get("pinned"):
        return True
    tier = str(row.get("retain_tier") or RetainTier.WORKING.value)
    if tier in (RetainTier.FORGET.value, RetainTier.ARCHIVE.value):
        return False
    if row.get("ephemeral"):
        return False
    score = float(row.get("retain_score") if row.get("retain_score") is not None else 0.5)
    summary = (row.get("summary") or "").strip()
    if not summary and not row.get("pinned"):
        return False
    return score >= MAP_SCORE_THRESHOLD and tier in (
        RetainTier.WORKING.value,
        RetainTier.DURABLE.value,
    )


def _clamp(score: float) -> float:
    return max(0.0, min(1.0, float(score)))


def _l0_hard_forget(title: str, summary: str) -> RetainVerdict | None:
    """Obvious noise — never map-worthy."""
    t = (title or "").strip()
    s = (summary or "").strip()
    combined = t or s
    if not combined:
        return RetainVerdict(
            RetainTier.FORGET, 0.05, ["empty"], ephemeral=True
        )
    if _UNTITLED.match(t):
        return RetainVerdict(
            RetainTier.FORGET, 0.08, ["untitled"], ephemeral=True
        )
    if _VOICE_CHECK.match(t) or _VOICE_CHECK.match(s):
        return RetainVerdict(
            RetainTier.FORGET, 0.05, ["voice_check"], ephemeral=True
        )
    if _AGENT_RETRY.match(t):
        return RetainVerdict(
            RetainTier.FORGET, 0.1, ["agent_retry"], ephemeral=True
        )
    if _CAPABILITY_FAQ.match(t) or _CAPABILITY_FAQ.match(s):
        return RetainVerdict(
            RetainTier.FORGET, 0.12, ["capability_faq"], ephemeral=True
        )
    # Distilled capability FAQ titles from real data
    if "capabilities" in t.lower() and "exo" in t.lower() and len(s) < 280:
        if "calendar" in s.lower() or "functions" in s.lower() or "managing" in s.lower():
            return RetainVerdict(
                RetainTier.ARCHIVE, 0.25, ["capability_faq_summary"], ephemeral=True
            )
    if _DOCUMENT_PREFIX.match(t) and not s:
        return RetainVerdict(
            RetainTier.ARCHIVE, 0.2, ["document_prefix_no_summary"], ephemeral=True
        )
    if len(combined) < 8 and not s:
        return RetainVerdict(
            RetainTier.FORGET, 0.1, ["too_short"], ephemeral=True
        )
    return None


def score_conversation(
    title: str,
    summary: str,
    *,
    action_item_count: int = 0,
    memory_link_count: int = 0,
    message_count: int = 0,
    pinned: bool = False,
    judged_by: JudgedBy = JudgedBy.RULE,
) -> RetainVerdict:
    """Score a conversation for retain / forget (L0 + L1 structure signals)."""
    if pinned:
        return RetainVerdict(
            RetainTier.DURABLE,
            1.0,
            ["pinned"],
            judged_by=JudgedBy.USER,
            ephemeral=False,
        )

    hard = _l0_hard_forget(title, summary)
    if hard is not None:
        return RetainVerdict(
            hard.tier,
            hard.score,
            hard.reasons,
            judged_by=judged_by,
            ephemeral=hard.ephemeral,
        )

    title_s = (title or "").strip()
    summary_s = (summary or "").strip()
    reasons: list[str] = []
    score = 0.4
    ephemeral = False

    if not summary_s:
        # Title-only chats: archive at best (not map-visible without summary).
        score = 0.25
        reasons.append("no_summary")
        if message_count <= 2:
            score = 0.15
            reasons.append("thin_thread")
            ephemeral = True
        return RetainVerdict(
            RetainTier.ARCHIVE,
            _clamp(score),
            reasons,
            judged_by=judged_by,
            ephemeral=ephemeral,
        )

    reasons.append("has_summary")
    score = 0.55

    # Initial connection check distilled as learning — demote.
    if re.search(r"connection (check|clear)|could hear them", summary_s, re.I):
        if action_item_count == 0 and memory_link_count == 0:
            return RetainVerdict(
                RetainTier.ARCHIVE,
                0.28,
                ["connection_check"],
                judged_by=judged_by,
                ephemeral=True,
            )

    if action_item_count > 0:
        score += 0.15
        reasons.append("action_items")
    if memory_link_count > 0:
        score += 0.2
        reasons.append("memory_links")
    if memory_link_count >= 2 or (memory_link_count >= 1 and action_item_count >= 1):
        score += 0.1
        reasons.append("rich_links")

    # Identity / CV / resume style durable topics
    durable_hint = re.search(
        r"\b(cv|resume|curriculum|identity|preference|deploy|project|"
        r"invoice|calendar|meeting|demo app)\b",
        f"{title_s} {summary_s}",
        re.I,
    )
    if durable_hint and (memory_link_count > 0 or len(summary_s) > 80):
        score += 0.1
        reasons.append("durable_topic")

    if message_count >= 8:
        score += 0.05
        reasons.append("substantive_thread")

    score = _clamp(score)

    if score >= 0.75 and (memory_link_count > 0 or action_item_count > 0):
        tier = RetainTier.DURABLE
    elif score >= MAP_SCORE_THRESHOLD:
        tier = RetainTier.WORKING
    else:
        tier = RetainTier.ARCHIVE
        ephemeral = score < 0.4

    return RetainVerdict(
        tier, score, reasons, judged_by=judged_by, ephemeral=ephemeral
    )


def merge_llm_verdict(
    rule: RetainVerdict,
    *,
    keep: bool,
    score: float,
    kind: str,
    reason: str,
    resume_worthy: bool,
) -> RetainVerdict:
    """Merge mid-band LLM output into a rule verdict.

    Cannot override L0 hard-forget / ephemeral capability patterns with reasons
    that indicate hard forget. Cannot raise pinned (handled by caller).
    """
    if rule.ephemeral and rule.tier == RetainTier.FORGET:
        return rule
    if any(r in ("voice_check", "agent_retry", "capability_faq", "untitled", "empty") for r in rule.reasons):
        return rule

    llm_score = _clamp(score)
    # Keep LLM within band relative to rule — allow ±0.25 but clamp to [0,1]
    blended = _clamp(0.4 * rule.score + 0.6 * llm_score)
    reasons = list(rule.reasons) + [f"llm:{kind or 'judge'}"]
    if reason:
        reasons.append(reason[:80])

    if not keep and not resume_worthy:
        return RetainVerdict(
            RetainTier.ARCHIVE,
            min(blended, 0.45),
            reasons,
            judged_by=JudgedBy.LLM,
            ephemeral=True,
        )
    if resume_worthy and blended >= 0.75:
        return RetainVerdict(
            RetainTier.DURABLE,
            blended,
            reasons,
            judged_by=JudgedBy.LLM,
            ephemeral=False,
        )
    if blended >= MAP_SCORE_THRESHOLD:
        return RetainVerdict(
            RetainTier.WORKING,
            blended,
            reasons,
            judged_by=JudgedBy.LLM,
            ephemeral=False,
        )
    return RetainVerdict(
        RetainTier.ARCHIVE,
        blended,
        reasons,
        judged_by=JudgedBy.LLM,
        ephemeral=blended < 0.4,
    )


def memory_entry_to_retain_verdict(entry: dict) -> RetainVerdict:
    """Thin adapter: map memory_entries visibility fields → RetainVerdict."""
    if entry.get("archived_at"):
        return RetainVerdict(RetainTier.ARCHIVE, 0.2, ["archived"])
    if entry.get("source") == "manual" or entry.get("reviewed"):
        return RetainVerdict(RetainTier.DURABLE, 0.95, ["trusted"])
    noise = float(entry.get("noise_score") or 0)
    if noise >= 0.55:
        return RetainVerdict(RetainTier.FORGET, 1.0 - noise, ["high_noise"], ephemeral=True)
    if noise >= 0.35:
        return RetainVerdict(RetainTier.ARCHIVE, 0.4, ["noisy_unreviewed"])
    recall_w = float(entry.get("recall_weight") or 1.0)
    if recall_w >= 1.25:
        return RetainVerdict(RetainTier.DURABLE, min(0.9, 0.6 + recall_w * 0.1), ["recall_boost"])
    return RetainVerdict(RetainTier.WORKING, max(0.55, 0.7 - noise), ["auto_clean"])
