"""
Lightweight post-classify audit signals for sort-plan CSV / NDJSON debug.

Surfaces script coverage, geography hints, folder-context contamination, and
LLM-vs-rerank disagreement without extra LLM calls.
"""

from __future__ import annotations

import re
from typing import Any

from sort_signals.geo import (
    folder_top_region,
    geo_hits,
    geo_rerank_adjustment,
    geo_supports_new_folder,
    geographic_folder_conflict,
    infer_document_regions,
)

# Latin tokenization mirrors classifier_scoring.rerank_candidate (audit parity).
_LATIN_TOKEN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,}")
_ARABIC_SCRIPT_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def _script_stats(text: str) -> dict[str, int]:
    sample = (text or "")[:12000]
    latin_tokens = _LATIN_TOKEN_RE.findall(sample.lower())
    arabic_chars = len(_ARABIC_SCRIPT_RE.findall(sample))
    return {
        "latin_token_count": len(latin_tokens),
        "arabic_char_count": arabic_chars,
        "text_char_count": len(sample),
    }


def winner_folder_context_snapshot(
    folder_name: str,
    folder_contexts: dict[str, dict] | None,
    *,
    max_keywords: int = 8,
    max_sample_chars: int = 120,
) -> dict[str, Any]:
    """Keywords/samples stored for the chosen folder (context-index contamination check)."""
    fc = (folder_contexts or {}).get(folder_name) or {}
    keywords = [
        str(k).strip()
        for k in (fc.get("keywords") or [])
        if isinstance(k, str) and str(k).strip()
    ][:max_keywords]
    samples = [
        str(s).strip()[:max_sample_chars]
        for s in (fc.get("samples") or [])
        if isinstance(s, str) and str(s).strip()
    ][:2]
    profile = str(fc.get("profile") or "").strip()[:160]
    return {
        "folder": folder_name,
        "keywords": keywords,
        "sample_snippets": samples,
        "profile": profile or None,
    }


def build_classify_audit(
    *,
    text: str,
    folder_name: str,
    llm_folder_name: str | None,
    llm_confidence: float | None,
    rerank_top_score: float | None,
    folder_contexts: dict[str, dict] | None,
    detected_language: str | None = None,
    document_briefing: str | None = None,
    briefing_wanted: bool = False,
    briefing_skipped_plain: bool = False,
    primary_purpose: str | None = None,
) -> dict[str, Any]:
    """Compact audit blob stored on ``decision_trace.classify_audit`` and CSV export."""
    lc = float(llm_confidence) if llm_confidence is not None else None
    rs = float(rerank_top_score) if rerank_top_score is not None else None
    gap: float | None = None
    if lc is not None and rs is not None:
        gap = round(lc - rs, 4)

    llm_fn = (llm_folder_name or "").strip()
    chosen = (folder_name or "").strip()
    disagree = bool(llm_fn and chosen and llm_fn.lower() != chosen.lower())

    briefing_status = "disabled"
    if briefing_wanted:
        briefing_status = "skipped_plaintext_fast_path" if briefing_skipped_plain else (
            "present" if (document_briefing or "").strip() else "wanted_but_empty"
        )

    audit: dict[str, Any] = {
        "script": _script_stats(text),
        "geo_hits": geo_hits(text),
        "detected_language": (detected_language or "").strip() or None,
        "briefing_status": briefing_status,
        "llm_folder": llm_fn or None,
        "chosen_folder": chosen or None,
        "llm_rerank_gap": gap,
        "llm_rerank_disagree": disagree,
        "primary_purpose": (primary_purpose or "").strip()[:120] or None,
        "geo_conflict": geographic_folder_conflict(text, chosen),
        "winner_context": winner_folder_context_snapshot(chosen, folder_contexts),
    }
    if llm_fn and llm_fn.lower() != chosen.lower():
        audit["llm_context"] = winner_folder_context_snapshot(llm_fn, folder_contexts)
    return audit


__all__ = [
    "build_classify_audit",
    "folder_top_region",
    "geo_hits",
    "geo_rerank_adjustment",
    "geo_supports_new_folder",
    "geographic_folder_conflict",
    "infer_document_regions",
    "winner_folder_context_snapshot",
]
