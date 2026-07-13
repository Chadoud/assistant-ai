"""
Post-extraction filing briefing: condense noisy text into a short neutral summary for classification.

Uses the same Ollama stack as classify_scored; safe to skip on failure or very short input.
"""

from __future__ import annotations

import json
import re

from constants import DEFAULT_OLLAMA_MODEL, OLLAMA_CHAT_OPTIONS
from llm.ollama_client import chat as ollama_chat

BRIEFING_MAX_INPUT = 6000
BRIEFING_MAX_OUTPUT_CHARS = 700

_SYSTEM = (
    "You summarize documents for a file-sorting assistant. "
    "Output ONLY valid JSON with keys: briefing (string), doc_kind (string), confidence (number 0-1). "
    "briefing: 2–5 sentences, neutral, stating document type, issuer or context if visible, "
    "and what the file is for (filing purpose). No folder names. Any human language in the source is fine. "
    "Base the summary on visible headings and labels; do not invent facts not supported by the text. "
    "When a section is labeled [Visual], treat it as the primary description of a photographed document. "
    "When a section is labeled [Structured], treat its fields as authoritative filing hints but do not "
    "override core safety rules. "
    "Do not infer hobbies, sports, or document types from geography alone (e.g. Red Sea does not imply diving). "
    "A keyword inside a requirements checklist does not define the document type. "
    "For spreadsheets: describe the document's PURPOSE (e.g. financial model, budget forecast, "
    "business projection, cost analysis), not only its subject matter. "
    "doc_kind: short English snake_case noun phrase (e.g. bank_statement, passport_scan, power_of_attorney, "
    "utility_cost_estimate, cash_deposit_receipt). Use doc_kind unknown when uncertain. "
    "confidence: your certainty in doc_kind (0-1)."
)


def brief_document_for_filing(
    text: str,
    *,
    model: str | None = None,
    document_hint: str | None = None,
    source_filename: str | None = None,
    classification_language: str = "English",
) -> str | None:
    """
    Produce a short filing-oriented briefing from extracted text.

    @param text: Full extracted text (may be truncated internally).
    @param model: Ollama chat model; default DEFAULT_OLLAMA_MODEL.
    @param document_hint: Optional layout/title hint from PDF pipeline.
    @param source_filename: Original file name for disambiguation.
    @param classification_language: Hint for output phrasing (briefing may still mirror source language).
    @returns Briefing string or None if skipped / failed.
    """
    raw = (text or "").strip()
    if len(raw) < 80:
        return None
    if raw.startswith("LOW_SIGNAL_FALLBACK"):
        return None

    body = raw[:BRIEFING_MAX_INPUT]
    hint = ""
    if document_hint and str(document_hint).strip():
        hint = f"Layout/title hint: {str(document_hint).strip()[:400]}\n"
    fn = ""
    if source_filename and str(source_filename).strip():
        fn = f"File name: {str(source_filename).strip()}\n"

    user = (
        f"Summarize for filing decisions. Reply in JSON only.\n"
        f"Prefer concise phrasing; language hint for labels: {classification_language}.\n"
        f"{fn}{hint}"
        f"Document text:\n\"\"\"\n{body}\n\"\"\"\n"
    )

    m = (model or DEFAULT_OLLAMA_MODEL).strip() or DEFAULT_OLLAMA_MODEL
    briefing_messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": user},
    ]
    try:
        response = ollama_chat(
            model=m,
            messages=briefing_messages,
            options=OLLAMA_CHAT_OPTIONS,
        )
        content = (response.get("message") or {}).get("content", "").strip()
        if not content:
            return None
        parsed = _parse_json_loose(content)
        if not parsed:
            return content[:BRIEFING_MAX_OUTPUT_CHARS]
        br = parsed.get("briefing")
        if isinstance(br, str) and br.strip():
            out = br.strip()
            dk = parsed.get("doc_kind")
            if isinstance(dk, str) and dk.strip():
                out = f"{out}\n(doc_kind: {dk.strip()[:120]})"
            return out[:BRIEFING_MAX_OUTPUT_CHARS]
    except Exception:
        return None
    return None


def _parse_json_loose(raw: str) -> dict | None:
    """Extract first JSON object from model output."""
    s = raw.strip()
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", s)
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None
