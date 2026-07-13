"""Read and answer questions about a user file using the same engine as the sort pipeline.

The sort feature can read PDFs (including scanned ones), images, Office docs and
spreadsheets because it runs every file through :mod:`ingestor`, which layers PDF
text extraction, Tesseract OCR and a local vision model. This action reuses that
exact engine so the assistant can read whatever the sort pipeline can — instead of
the old PyMuPDF-text-only path that returned nothing for scanned documents and hard-
required a Gemini key.

Gemini is used only as an optional answer-writer over the already-extracted text; if
no key is configured, the extracted text is returned directly.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Documents (especially scanned PDFs) routinely exceed a few MB; match the sort
# pipeline's tolerance rather than rejecting real files.
MAX_BYTES = 50 * 1024 * 1024
ANSWER_TEXT_BUDGET = 16_000
RAW_EXCERPT_BUDGET = 8_000


def _home() -> Path:
    return Path.home()


def _safe_file_under_home(p: str) -> Path | None:
    try:
        path = Path(p).expanduser().resolve()
        if path.is_relative_to(_home()) and path.is_file():
            return path
    except ValueError:
        pass
    return None


def _resolve_vision_model() -> str | None:
    """Pick an installed vision-capable model so scanned PDFs/images get OCR+vision."""
    try:
        from classifier_ollama import list_models
        from vision import find_vision_model

        return find_vision_model(list_models())
    except Exception:
        logger.debug("vision model resolution failed", exc_info=True)
        return None


def _extract_document_text(path: Path) -> tuple[str, str]:
    """
    Return (text, extraction_source) using the shared sort ingest engine.

    Handles PDFs (text + OCR + vision fallback), images, Office docs, spreadsheets
    and plain text. Raises on unrecoverable extraction failures.
    """
    from ingestor import extract_content

    payload = extract_content(str(path), vision_model=_resolve_vision_model())
    text = str(payload.get("text", "") or "")
    source = str(payload.get("extraction_source", "") or "unknown")
    return text, source


def _write_answer_with_gemini(instruction: str, path: Path, text: str) -> str | None:
    """Ask Gemini to answer ``instruction`` over extracted ``text``; None if unavailable."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from google import genai  # type: ignore[import]
        from google.genai import types  # type: ignore[import]

        model = os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.0-flash")
        client = genai.Client(api_key=api_key)
        prompt = (
            f"{instruction}\n\n"
            f"File: {path.name}\n\n"
            f"Extracted content:\n{text[:ANSWER_TEXT_BUDGET]}"
        )
        resp = client.models.generate_content(
            model=model,
            contents=[types.Content(parts=[types.Part.from_text(text=prompt)])],
        )
        answer = (resp.text or "").strip()
        return answer or None
    except Exception:
        logger.exception("analyze_local_file: gemini answer step failed")
        return None


def analyze_local_file(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Read a local file and answer a question about it.

    Parameters:
        path: absolute path to an existing file under the user's home directory
        instruction: what to extract, summarize or answer

    Returns ``{"ok": True, "data": {answer, path, source}}`` on success, where
    ``source`` records how the text was extracted (e.g. ``pdf_text``, ``pdf_ocr``).
    """
    logger.debug("[action] analyze_local_file called args=%r", parameters)
    raw = str(parameters.get("path", "")).strip()
    instruction = str(
        parameters.get("instruction", "Summarize this file for the user.")
    ).strip()

    path = _safe_file_under_home(raw)
    if not path:
        return {"ok": False, "error": "path must be an existing file under your home directory"}

    try:
        size = path.stat().st_size
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    if size > MAX_BYTES:
        return {"ok": False, "error": f"File too large (max {MAX_BYTES // (1024 * 1024)} MB)"}

    try:
        text, source = _extract_document_text(path)
    except Exception as exc:
        logger.exception("analyze_local_file: extraction failed")
        return {"ok": False, "error": f"Couldn't read this file: {exc}"}

    if not text.strip():
        return {
            "ok": False,
            "error": (
                "I couldn't pull any readable text from this file — it may be blank, "
                "corrupt, or an unsupported format."
            ),
        }

    answer = _write_answer_with_gemini(instruction, path, text)
    if answer is not None:
        return {"ok": True, "data": {"answer": answer, "path": str(path), "source": source}}

    return {
        "ok": True,
        "data": {
            "answer": text[:RAW_EXCERPT_BUDGET],
            "path": str(path),
            "source": source,
            "note": "Returning extracted text (no answer model configured).",
        },
    }
