"""
Lightweight document language hint for prompts and OCR hints (no extra dependencies).

Returns a human-readable label aligned with DEFAULT_JOB_LANGUAGE values used in prompts.
"""

from __future__ import annotations

import re

# French cues common in Swiss/admin PDFs (short list — generic signal, not locale rules).
_FRENCH_MARKERS = re.compile(
    r"\b(le|la|les|des|une|pour|avec|sans|être|été|être|contrat|"
    r"attestation|assurance|demande|indemnité|chômage|emploi|"
    r"république|canton|monsieur|madame|certificat|bancaire)\b",
    re.IGNORECASE,
)
_FRENCH_CHARS = re.compile(r"[àâäéèêëïîôùûüçœæ]", re.IGNORECASE)
_ARABIC_SCRIPT = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")


def detect_document_language(text: str, *, fallback: str = "English") -> str:
    """
    Infer primary language from extracted text for LLM / OCR tuning.

    @param text: Raw or OCR text (may be short).
    @param fallback: Returned when signal is insufficient.
    @returns "Arabic", "French", "German", "Italian", or "English" (default bucket).
    """
    t = (text or "").strip()
    if len(t) < 40:
        return fallback

    sample = t[:8000]
    arabic_chars = len(_ARABIC_SCRIPT.findall(sample))
    if arabic_chars >= 12:
        return "Arabic"

    fr_word_hits = len(_FRENCH_MARKERS.findall(sample))
    fr_char_hits = len(_FRENCH_CHARS.findall(sample))

    # German / Italian: light heuristics for mixed EU inboxes
    de_score = len(re.findall(r"\b(der|die|das|und|nicht|für|mit)\b", sample, re.IGNORECASE))
    it_score = len(re.findall(r"\b(il|la|per|con|non|che|una)\b", sample, re.IGNORECASE))

    if de_score >= 8 and de_score > fr_word_hits + 3:
        return "German"
    if it_score >= 8 and it_score > fr_word_hits + 3:
        return "Italian"

    if fr_word_hits >= 4 or fr_char_hits >= 6 or (fr_word_hits >= 2 and fr_char_hits >= 2):
        return "French"

    return fallback


def tesseract_langs_for_hint(detected: str, job_langs: list[str] | None) -> list[str] | None:
    """
    Merge detected language into Tesseract lang list hints (3-letter where applicable).

    @param detected: Output of detect_document_language.
    @param job_langs: Existing langs from job config (may be empty).
    @returns Merged list or None to mean "leave caller default".
    """
    base = [x.strip() for x in (job_langs or []) if isinstance(x, str) and x.strip()]
    extra: list[str] = []
    d = (detected or "").strip().lower()
    if d == "french":
        extra = ["fra"]
    elif d == "arabic":
        extra = ["ara"]
    elif d == "german":
        extra = ["deu"]
    elif d == "italian":
        extra = ["ita"]
    else:
        return base if base else None

    out: list[str] = []
    seen: set[str] = set()
    for group in (extra, base):
        for x in group:
            k = x.lower()
            if k not in seen:
                seen.add(k)
                out.append(x)
    return out or None
