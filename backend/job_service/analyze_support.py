"""Analyze-phase helpers (briefing gates, timing logs) used by ``JobService``."""

from __future__ import annotations

import logging
import pathlib

from constants import (
    BRIEFING_MIN_QUALITY,
    BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS,
    BRIEFING_SKIP_MAX_TEXT_CHARS,
    BRIEFING_SKIP_MIN_QUALITY,
    DOCUMENT_BRIEFING_ENABLE,
    DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE,
    EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS,
    EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG,
    EXTRACTION_UNCERTAIN_QUALITY,
)
from ingest_image_merge import VISUAL_SECTION_TAG

logger = logging.getLogger(__name__)


def effective_document_briefing_enabled(cfg: dict, *, extraction_source: str | None = None) -> bool:
    """
    Per-job override when ``document_briefing_enable`` is a bool; else server env default.

    Image OCR/vision always uses briefing unless explicitly disabled on the job — scans
    benefit most from a condensed filing summary before classification.
    """
    raw = cfg.get("document_briefing_enable")
    src = (extraction_source or "").strip().lower()
    if src.startswith("image_"):
        if isinstance(raw, bool) and raw is False:
            return False
        return True
    if isinstance(raw, bool):
        return raw
    return DOCUMENT_BRIEFING_ENABLE


def should_skip_briefing_for_small_plaintext(
    *,
    text: str,
    extraction_source: str,
    quality_score: float,
    low_signal: bool,
    gmail_staged_part: str | None,
) -> bool:
    """Evidence-style fast path: readable plaintext needs no filing briefing within size caps.

    Extended to cover docx_text and spreadsheet_preview: both produce clean structured text
    with document_hint already set, so a briefing LLM call adds little filing signal.
    """
    if not DOCUMENT_BRIEFING_SKIP_SMALL_TEXT_ENABLE:
        return False
    if low_signal:
        return False
    if quality_score < BRIEFING_SKIP_MIN_QUALITY:
        return False
    src = (extraction_source or "").lower()
    if src not in {
        "plain_text",
        "legacy_text",
        "fallback_plain_text",
        "docx_text",
        "spreadsheet_preview",
    }:
        return False
    max_chars = (
        BRIEFING_SKIP_GMAIL_MESSAGE_MAX_TEXT_CHARS
        if gmail_staged_part == "message_body"
        else BRIEFING_SKIP_MAX_TEXT_CHARS
    )
    if len(text) > max_chars:
        return False
    return True


def should_skip_briefing_for_untrusted_extract(
    *,
    text: str,
    extraction_source: str,
    quality_score: float,
    low_signal: bool,
) -> bool:
    """Skip briefing when OCR-only signal is too weak; always brief when [Visual] is present."""
    if low_signal:
        return True
    body = (text or "").strip()
    if VISUAL_SECTION_TAG in body:
        return False
    src = (extraction_source or "").lower()
    if src.startswith("image_") and quality_score < float(BRIEFING_MIN_QUALITY):
        return True
    if src.startswith("image_") and quality_score < float(EXTRACTION_UNCERTAIN_QUALITY):
        return True
    return False


def log_analyze_phase_timing(
    *,
    job_id: str,
    idx: int,
    file_row: dict,
    cfg: dict,
    extract_ms: float | None,
    briefing_ms: float,
    classify_ms: float | None,
    wall_ms: float,
    extraction_source: str | None,
    text_chars: int,
    want_briefing: bool,
    skip_plain: bool,
    error: str | None,
) -> None:
    """Emit DEBUG timing for every row when enabled; INFO when wall time exceeds slow threshold."""
    fname = pathlib.Path(str(file_row.get("path", ""))).name
    model = cfg.get("model", "")
    ex_s = f"{extract_ms:.1f}" if extract_ms is not None else "n/a"
    cl_s = f"{classify_ms:.1f}" if classify_ms is not None else "n/a"
    status = "error" if error else str(file_row.get("status", ""))

    if EXOSITES_ANALYZE_PHASE_TIMING_DEBUG_LOG:
        logger.debug(
            "analyze_phase_timing job_id=%s row=%s file=%r wall_ms=%.1f extract_ms=%s briefing_ms=%.1f classify_ms=%s "
            "chars=%s source=%r model=%r want_briefing=%s skip_plain=%s status=%s err=%s",
            job_id[:12],
            idx,
            fname,
            wall_ms,
            ex_s,
            briefing_ms,
            cl_s,
            text_chars,
            extraction_source,
            model,
            want_briefing,
            skip_plain,
            status,
            error[:200] if error else "",
        )

    slow_ms = float(EXOSITES_ANALYZE_PHASE_SLOW_LOG_MS)
    if slow_ms > 0 and wall_ms >= slow_ms:
        logger.info(
            "analyze_slow job_id=%s row=%s file=%r wall_ms=%.0fms extract_ms=%s briefing_ms=%.0fms classify_ms=%s "
            "chars=%s source=%r model=%r status=%s err=%s",
            job_id[:12],
            idx,
            fname,
            wall_ms,
            ex_s,
            briefing_ms,
            cl_s,
            text_chars,
            extraction_source,
            model,
            status,
            error[:300] if error else "",
        )
