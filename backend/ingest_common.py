"""Shared extraction helpers (payload shape, quality estimate, plain-text extensions)."""

from __future__ import annotations

import pathlib
import re
from typing import Any

from constants import MAX_CHARS


class ExtractionError(Exception):
    """Raised when a file cannot be parsed into usable text."""


PLAIN_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".rst",
    ".log",
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".html",
    ".htm",
    ".css",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".xml",
    ".sh",
    ".bat",
    ".ps1",
    ".sql",
    ".r",
    ".c",
    ".cpp",
    ".h",
    ".java",
    ".cs",
    ".go",
    ".rb",
    ".php",
}

# iCalendar / vCalendar files — deterministic extraction source, no LLM classify needed.
CALENDAR_EXTENSIONS = {".ics", ".vcs"}


def low_signal_hint(file_path: str, *, kind: str) -> str:
    stem = pathlib.Path(file_path).stem.replace("_", " ").replace("-", " ")
    return f"LOW_SIGNAL_FALLBACK kind={kind} filename={stem}"[:MAX_CHARS]


def estimate_spreadsheet_quality(text: str) -> float:
    """
    Like ``estimate_quality`` but does not treat numeric/tabular cells as junk: many
    spreadsheets have few long alphabetic tokens yet are strong filing signal.
    """
    base = estimate_quality(text)
    txt = (text or "").strip()
    if not txt:
        return 0.0
    lines = max(1, txt.count("\n") + 1)
    if lines >= 4 and len(txt) > 120:
        tabular = min(0.62, 0.30 + min(lines / 100.0, 0.16) + min(len(txt) / 6000.0, 0.16))
        return max(base, tabular)
    return base


def estimate_quality(text: str) -> float:
    """
    Heuristic 0..1 for how much *usable* text we extracted. Alphabetic word diversity
    is the main signal, with boosts for numeric-dense (CNC/G-code) and structured video
    summaries so weak-token technical content is not always scored as junk.
    """
    txt = (text or "").strip()
    if not txt:
        return 0.0
    if txt.startswith("LOW_SIGNAL_FALLBACK"):
        return 0.05
    alpha_tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{3,}", txt)
    uniq = len(set(t.lower() for t in alpha_tokens))
    length_factor = min(len(txt) / 1000.0, 1.0)
    token_factor = min(uniq / 80.0, 1.0)
    score = (0.45 * length_factor) + (0.55 * token_factor)
    # G-code / CAM / logs: many coordinate tokens, few "words" in [A-Za-z]{3+} sense.
    digit_runs = len(re.findall(r"\d{2,}", txt))
    line_count = txt.count("\n") + 1
    if digit_runs >= 40 and line_count >= 8:
        technical = min(0.72, 0.35 + min(digit_runs / 450.0, 0.2) + min(line_count / 200.0, 0.17))
        score = max(score, technical)
    # Video extract template: [Visual] + [Spoken] (even mid-length clips score too low on alpha-only heuristics).
    if "[Visual]" in txt and "[Spoken]" in txt and len(txt) > 250:
        video_struct = min(
            0.64,
            0.32 + min(len(txt) / 3000.0, 0.2) + min(uniq / 90.0, 0.12),
        )
        score = max(score, video_struct)
    return max(0.0, min(1.0, score))


def extraction_confidence(
    text: str,
    extraction_source: str,
    *,
    quality_score: float | None = None,
    provenance: dict[str, bool] | None = None,
) -> float:
    """
    Unified 0..1 score for how much trustworthy signal extraction yielded.

    Combines quality_score (when provided), source-specific heuristics, and
    OCR/vision provenance. Used to trigger structured vision on degraded scans.
    """
    src = (extraction_source or "").strip().lower()
    txt = (text or "").strip()
    if txt.startswith("LOW_SIGNAL_FALLBACK") or src.endswith("low_signal"):
        return 0.05

    base = float(quality_score) if quality_score is not None else estimate_quality(txt)
    if src in ("image_hybrid", "image_vision", "image_ocr"):
        base = max(base, estimate_image_filing_quality(txt, src))
    elif src.startswith("pdf_"):
        base = max(base, estimate_quality(txt))

    prov = provenance or {}
    ocr_on = bool(prov.get("ocr"))
    vision_on = bool(prov.get("vision"))
    if vision_on and not ocr_on:
        base = max(base, 0.28)
    if ocr_on and not vision_on:
        from ingest_image_merge import ocr_is_high_trust_for_filing

        if not ocr_is_high_trust_for_filing(txt):
            base = min(base, 0.42)
    if ocr_on and vision_on and "[Structured]" not in txt:
        base = min(1.0, base + 0.04)

    return max(0.0, min(1.0, float(base)))


def estimate_image_filing_quality(text: str, extraction_source: str) -> float:
    """
    ``image_ocr`` / ``image_vision`` / ``image_hybrid`` often yield short lines with enough signal to file;
    ``image_low_signal`` stays on the low-signal path.
    """
    src = (extraction_source or "").strip().lower()
    if src in ("image_hybrid", "image_vision", "image_ocr"):
        from ingest_image_merge import estimate_hybrid_image_quality

        return estimate_hybrid_image_quality(text, src)
    if src == "image_low_signal":
        return estimate_quality(text)
    base = estimate_quality(text)
    t = (text or "").strip()
    if t.startswith("LOW_SIGNAL_FALLBACK"):
        return base
    return base


def filename_tokens(stem: str) -> list[str]:
    tokens = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]{2,}", stem.lower())
    out: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out[:24]


def build_payload(
    *,
    text: str,
    extraction_source: str,
    quality_score: float,
    file_path: str,
    filename_tokens: list[str],
    ocr_used: bool,
    page_count: int | None = None,
    document_hint: str | None = None,
    extra_signals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge ``extra_signals`` into the returned ``signals`` dict when values are not None."""
    txt = (text or "")[:MAX_CHARS]
    signals: dict[str, Any] = {
        "ocr_used": bool(ocr_used),
        "char_count": len(txt),
        "filename_tokens": filename_tokens,
    }
    if page_count is not None:
        signals["page_count"] = int(page_count)
    dh = str(document_hint).strip() if isinstance(document_hint, str) and document_hint.strip() else None
    if dh:
        signals["document_hint"] = dh[:500]
    if extra_signals:
        for k, v in extra_signals.items():
            if v is not None:
                signals[str(k)] = v
    return {
        "text": txt,
        "extraction_source": extraction_source,
        "quality_score": float(max(0.0, min(1.0, quality_score))),
        "signals": signals,
    }
