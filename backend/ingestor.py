"""
Extract readable text from various file types.
Returns a plain string of up to MAX_CHARS characters.
"""

from __future__ import annotations

import io
import logging
import pathlib
import re
from typing import Any

logger = logging.getLogger(__name__)

import vision as _vision
from constants import (
    EXTRACTION_LOW_QUALITY_FLOOR,
    IMAGE_VISION_ALWAYS,
    IMAGE_VISION_ENABLE,
    MAX_CHARS,
    OCR_PAGE_LIMIT,
    PDF_VISION_FILING_LOW_Q,
    PDF_VISION_SUPPLEMENT_ENABLE,
    PDF_VISION_SUPPLEMENT_Q_MAX,
    PDF_VISION_SUPPLEMENT_Q_MIN,
    SPREADSHEET_PREVIEW_MAX_ROWS,
    SPREADSHEET_PREVIEW_MAX_SHEETS,
    STRUCTURED_VISION_ENABLE,
    STRUCTURED_VISION_STRUCTURE_JOBS,
    STRUCTURED_VISION_TRIGGER,
    VIDEO_FILE_EXTENSIONS,
)
from ingest_common import (
    CALENDAR_EXTENSIONS,
    PLAIN_TEXT_EXTENSIONS,
    ExtractionError,
    build_payload,
    estimate_quality,
    estimate_spreadsheet_quality,
    extraction_confidence,
    filename_tokens,
    low_signal_hint,
)
from ingest_image_merge import (
    estimate_hybrid_image_quality,
    merge_image_extraction_signals,
    prepend_structured_block,
)
from ingest_tesseract import (
    OCR_RENDER_ZOOM,
    OcrRuntime,
    effective_tesseract_lang,
    maybe_retry_arabic_ocr,
    resolve_ocr_runtime,
    tesseract_image_with_runtime,
)
from video_extract import extract_video_for_filing


def _merge_document_hints(*parts: str | None) -> str | None:
    """Join non-empty hint strings for the classifier (layout + filename heuristics)."""
    xs = [p.strip() for p in parts if isinstance(p, str) and p.strip()]
    if not xs:
        return None
    return " \n".join(xs)[:500]


def _cam_pts_document_hint() -> str:
    """
    .pts is often an ASCII point set (XYZ samples) next to CNC programs — not a calendar file.
    Raw floats are easy for the model to misread as unrelated domains without this cue.
    """
    return (
        "File type: ASCII point set / 3D coordinate samples (common with CAM, CNC, metrology, mesh). "
        "This is not an iCalendar (.ics) or Google Calendar export. "
        "File under manufacturing, CNC/CAD, or technical coordinate data — not Events, Appointments, or calendar."
    )[:500]


def _pdf_filename_context_hint(path: pathlib.Path) -> str | None:
    """
    Disambiguate common Swiss filenames when body text is thin or numeric-only OCR.
    """
    hay = f"{path.stem} {path.name}".lower()
    if "avs" in hay and "assurance" in hay:
        return (
            "Filename suggests Swiss AVS (Assurance-vieillesse / social insurance). "
            "Prefer health/insurance or social-security style folders; do not use bank statement "
            "unless the text clearly shows account transactions, or tax unless it is clearly a tax return/assessment."
        )
    return None


def _image_ocr_is_actionable_for_filing(text: str) -> bool:
    """
    Tesseract often emits a few junk characters on product photos; that must not skip vision.
    """
    t = (text or "").strip()
    if len(t) < 12:
        return False
    alpha = sum(1 for c in t if c.isalpha())
    if alpha < 10:
        return False
    if alpha / max(len(t), 1) < 0.14:
        return False
    return True


def _structured_vision_enabled(*, structure_sort: bool) -> bool:
    return bool(
        STRUCTURED_VISION_ENABLE
        or (structure_sort and STRUCTURED_VISION_STRUCTURE_JOBS)
    )


def extract_content(
    file_path: str,
    vision_model: str | None = None,
    tesseract_lang: str | None = None,
    tesseract_langs: list[str] | None = None,
    tesseract_auto: bool = True,
    *,
    structure_sort: bool = False,
) -> dict[str, Any]:
    """
    Return a structured extraction payload:
    {
      text, extraction_source, quality_score, signals
    }
    """
    ocr = resolve_ocr_runtime(tesseract_lang, tesseract_langs, tesseract_auto)
    path = pathlib.Path(file_path)
    ext = path.suffix.lower()
    fn_tokens = filename_tokens(path.stem)

    try:
        if ext == ".pdf":
            return _extract_pdf_structured(
                file_path, fn_tokens, vision_model, ocr, structure_sort=structure_sort
            )
        if ext in (".docx", ".doc"):
            text = _extract_docx(file_path)
            return build_payload(
                text=text,
                extraction_source="docx_text",
                quality_score=estimate_quality(text),
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=False,
            )
        if ext in (".xlsx", ".xls", ".csv"):
            text = _extract_spreadsheet(file_path, ext)
            return build_payload(
                text=text,
                extraction_source="spreadsheet_preview",
                quality_score=estimate_spreadsheet_quality(text),
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=False,
                document_hint=_spreadsheet_document_hint(text, path),
            )
        if ext in (".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"):
            text, source, provenance, ocr_part, vision_part = _extract_image_structured(
                file_path, vision_model, ocr
            )
            q = estimate_hybrid_image_quality(
                text,
                source,
                ocr_text=ocr_part or None,
                vision_text=vision_part or None,
            )
            structured_signals: dict | None = None
            conf = extraction_confidence(
                text,
                source,
                quality_score=q,
                provenance=provenance,
            )
            if (
                _structured_vision_enabled(structure_sort=structure_sort)
                and vision_model
                and conf < float(STRUCTURED_VISION_TRIGGER)
            ):
                text, structured_signals = _apply_structured_vision(
                    file_path, vision_model, text, provenance
                )
                if structured_signals:
                    q = max(q, min(0.55, float(structured_signals.get("confidence", 0.5))))
            extra: dict[str, Any] = {
                "extraction_provenance": provenance,
                "extraction_confidence": conf,
            }
            if structured_signals:
                extra["structured_vision"] = structured_signals
            return build_payload(
                text=text,
                extraction_source=source,
                quality_score=q,
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=bool(provenance.get("ocr")),
                extra_signals=extra,
            )
        if ext in VIDEO_FILE_EXTENSIONS:
            return extract_video_for_filing(file_path, fn_tokens, vision_model=vision_model)
        if ext in CALENDAR_EXTENSIONS:
            text = _extract_plain(file_path)
            return build_payload(
                text=text,
                extraction_source="calendar_ics",
                quality_score=1.0,
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=False,
                document_hint="iCalendar event file — sort into a Calendar or Events folder.",
            )
        if ext in PLAIN_TEXT_EXTENSIONS:
            text = _extract_plain(file_path)
            return build_payload(
                text=text,
                extraction_source="plain_text",
                quality_score=estimate_quality(text),
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=False,
            )
        if ext == ".pts":
            text = _extract_plain(file_path)
            return build_payload(
                text=text,
                extraction_source="cam_point_set_text",
                quality_score=estimate_quality(text),
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=False,
                document_hint=_cam_pts_document_hint(),
            )
        text = _extract_plain(file_path)
        return build_payload(
            text=text,
            extraction_source="fallback_plain_text",
            quality_score=estimate_quality(text),
            file_path=file_path,
            filename_tokens=fn_tokens,
            ocr_used=False,
        )
    except Exception as exc:
        raise ExtractionError(f"Could not extract text: {exc}") from exc


def extract_text(file_path: str) -> str:
    """Return extracted text from the file, truncated to MAX_CHARS."""
    return str(extract_content(file_path).get("text", ""))[:MAX_CHARS]


def _pdf_page_layout_hint(doc: Any) -> str | None:
    """Largest-type spans on page 0 — generic title/header cue for classification."""
    try:
        page = doc[0]
        d = page.get_text("dict")
        best_size = 0.0
        parts: list[str] = []
        for block in d.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    sz = float(span.get("size", 0) or 0)
                    t = (span.get("text") or "").strip()
                    if len(t) < 3:
                        continue
                    if sz >= best_size * 0.92:
                        if sz > best_size + 0.25:
                            best_size = sz
                            parts = [t]
                        elif abs(sz - best_size) < 0.35 or sz >= best_size:
                            if t not in parts:
                                parts.append(t)
        hint = " ".join(parts[:5])[:420]
        return hint if hint else None
    except Exception as exc:
        logger.debug("document_hint extraction failed: %s", exc)
        return None


def _extract_pdf_structured(
    file_path: str,
    fn_tokens: list[str],
    vision_model: str | None = None,
    ocr: OcrRuntime | None = None,
    *,
    structure_sort: bool = False,
) -> dict[str, Any]:
    if ocr is None:
        ocr = resolve_ocr_runtime(effective_tesseract_lang(None), None, True)
    import fitz  # PyMuPDF
    path = pathlib.Path(file_path)
    fn_context = _pdf_filename_context_hint(path)
    doc = fitz.open(file_path)
    try:
        layout_hint = _pdf_page_layout_hint(doc)
        doc_hint = _merge_document_hints(layout_hint, fn_context)
        chunks = []
        total = 0
        for page in doc:
            text = page.get_text()
            remaining = MAX_CHARS - total
            if remaining <= 0:
                break
            chunks.append(text[:remaining])
            total += len(text)
            extracted = " ".join(chunks).strip()[:MAX_CHARS]
            if extracted:
                q_text = estimate_quality(extracted)
                # Keep walking to OCR/vision fallbacks when native PDF text is too weak
                # (slides/posters often contain sparse selectable text but strong visual signal).
                if q_text < float(EXTRACTION_LOW_QUALITY_FLOOR):
                    break
                return build_payload(
                    text=extracted,
                    extraction_source="pdf_text",
                    quality_score=q_text,
                    file_path=file_path,
                    filename_tokens=fn_tokens,
                    ocr_used=False,
                    page_count=doc.page_count,
                    document_hint=doc_hint,
                )

        ocr_text = _ocr_pdf_pages(doc, ocr)
        if ocr_text:
            ocr_text = ocr_text[:MAX_CHARS]
            q_ocr = estimate_quality(ocr_text)
            src = "pdf_ocr"
            txt_out = ocr_text
            filing_prefix = ""
            if vision_model and q_ocr <= PDF_VISION_FILING_LOW_Q and q_ocr > 0.06:
                try:
                    img_bytes = _render_pdf_first_page(doc)
                    fd = _vision.describe_image_bytes(img_bytes, vision_model, purpose="filing")
                    if fd and str(fd).strip():
                        filing_prefix = (
                            "[Vision filing summary]\n"
                            + str(fd).strip()[: MAX_CHARS // 3]
                            + "\n\n"
                        )
                        q_ocr = max(q_ocr, min(0.55, estimate_quality(fd)))
                        src = "pdf_ocr_vision_filing"
                except Exception as exc:
                    logger.debug("pdf vision filing supplement failed for %r: %s", file_path, exc)
            if filing_prefix:
                txt_out = (filing_prefix + ocr_text)[:MAX_CHARS]
            if (
                PDF_VISION_SUPPLEMENT_ENABLE
                and vision_model
                and not filing_prefix
                and PDF_VISION_SUPPLEMENT_Q_MIN <= q_ocr <= PDF_VISION_SUPPLEMENT_Q_MAX
            ):
                try:
                    img_bytes = _render_pdf_first_page(doc)
                    description = _vision.describe_image_bytes(img_bytes, vision_model)
                    if description and str(description).strip():
                        desc = str(description).strip()[: MAX_CHARS // 2]
                        txt_out = f"[Vision supplement]\n{desc}\n\n{txt_out}"[:MAX_CHARS]
                        q_ocr = max(q_ocr, min(0.72, estimate_quality(desc)))
                        src = "pdf_ocr_vision_supplement"
                except Exception as exc:
                    logger.debug("pdf vision supplement failed for %r: %s", file_path, exc)
            pdf_provenance = {"ocr": True, "vision": bool(filing_prefix or "vision" in src)}
            conf = extraction_confidence(
                txt_out, src, quality_score=q_ocr, provenance=pdf_provenance
            )
            structured_signals: dict | None = None
            if (
                _structured_vision_enabled(structure_sort=structure_sort)
                and vision_model
                and conf < float(STRUCTURED_VISION_TRIGGER)
            ):
                try:
                    img_bytes = _render_pdf_first_page(doc)
                    txt_out, structured_signals = _apply_structured_vision_bytes(
                        img_bytes, vision_model, txt_out, pdf_provenance
                    )
                    if structured_signals:
                        q_ocr = max(q_ocr, min(0.55, float(structured_signals.get("confidence", 0.5))))
                except Exception as exc:
                    logger.debug("pdf structured vision failed for %r: %s", file_path, exc)
            extra_pdf: dict[str, Any] = {
                "extraction_provenance": pdf_provenance,
                "extraction_confidence": conf,
            }
            if structured_signals:
                extra_pdf["structured_vision"] = structured_signals
            return build_payload(
                text=txt_out,
                extraction_source=src,
                quality_score=q_ocr,
                file_path=file_path,
                filename_tokens=fn_tokens,
                ocr_used=True,
                page_count=doc.page_count,
                document_hint=doc_hint,
                extra_signals=extra_pdf,
            )

        if vision_model:
            try:
                img_bytes = _render_pdf_first_page(doc)
                description = _vision.describe_image_bytes(img_bytes, vision_model)
                if description:
                    desc = description[:MAX_CHARS]
                    qv = estimate_quality(desc)
                    return build_payload(
                        text=desc,
                        extraction_source="pdf_vision",
                        quality_score=min(0.75, float(qv)),
                        file_path=file_path,
                        filename_tokens=fn_tokens,
                        ocr_used=False,
                        page_count=doc.page_count,
                        document_hint=doc_hint,
                    )
            except Exception as exc:
                logger.debug("pdf pure-vision path failed for %r: %s", file_path, exc)

        fallback = low_signal_hint(file_path, kind="scanned_pdf")
        return build_payload(
            text=fallback,
            extraction_source="pdf_low_signal",
            quality_score=0.05,
            file_path=file_path,
            filename_tokens=fn_tokens,
            ocr_used=True,
            page_count=doc.page_count,
            document_hint=_merge_document_hints(layout_hint, fn_context),
        )
    finally:
        doc.close()


def _extract_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    parts = []
    total = 0
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        remaining = MAX_CHARS - total
        if remaining <= 0:
            break
        parts.append(text[:remaining])
        total += len(text)
    return " ".join(parts)


def _spreadsheet_document_hint(text: str, path: pathlib.Path) -> str | None:
    """
    Build a filing hint from the spreadsheet preview text.

    Pulls sheet names from '=== Sheet Name ===' markers and the first
    non-Unnamed column-header row so the classifier sees structural intent
    (e.g. 'Factor Carbon Price', 'Cost production') as a separate signal
    rather than noise buried in the flat token bag.
    """
    sheet_names = re.findall(r"=== (.+?) ===", text)
    header_line = next(
        (line for line in text.splitlines() if "|" in line and "Unnamed" not in line),
        None,
    )
    if not sheet_names and not header_line:
        return None
    parts: list[str] = []
    if sheet_names:
        parts.append("Sheets: " + ", ".join(sheet_names[:3]))
    if header_line:
        parts.append("Columns: " + header_line.strip()[:200])
    return f"Spreadsheet '{path.stem}'. " + ". ".join(parts)


def _extract_spreadsheet(file_path: str, ext: str) -> str:
    """
    Flatten a preview of tabular data for the classifier. Reads up to
    ``SPREADSHEET_PREVIEW_MAX_ROWS`` per sheet and, for ``.xlsx``, up to
    ``SPREADSHEET_PREVIEW_MAX_SHEETS`` sheets (not only the first).
    """
    import pandas as pd

    max_rows = max(1, int(SPREADSHEET_PREVIEW_MAX_ROWS))
    max_sheets = max(1, int(SPREADSHEET_PREVIEW_MAX_SHEETS))
    blocks: list[str] = []

    def _format_block(sheet_label: str, df: "pd.DataFrame") -> str:
        if df is None or df.empty:
            return ""
        header = " | ".join(str(c) for c in df.columns)
        n = min(max_rows, len(df))
        # Coerce per-cell: ``join`` requires str; Excel can yield float/numpy scalars in object columns
        # even when the frame is not fully ``.astype(str)`` (dupe columns, mixed dtypes, read quirks).
        def _row_to_line(r: "pd.Series") -> str:
            return " | ".join(str(v) for v in r.tolist())

        row_lines = df.head(n).apply(_row_to_line, axis=1).tolist()
        return f"=== {sheet_label} ===\n{header}\n" + "\n".join(row_lines)

    if ext == ".csv":
        df = pd.read_csv(
            file_path,
            nrows=max_rows,
            on_bad_lines="skip",
            encoding_errors="replace",
        )
        blocks.append(_format_block("csv", df))
    elif ext == ".xlsx":
        with pd.ExcelFile(file_path, engine="openpyxl") as xl:
            for sn in xl.sheet_names[:max_sheets]:
                df = pd.read_excel(xl, sheet_name=sn, nrows=max_rows)
                block = _format_block(str(sn), df)
                if block:
                    blocks.append(block)
    else:
        # Legacy .xls (binary Excel): needs ``xlrd`` for reliable reads in many environments.
        df = None
        try:
            df = pd.read_excel(file_path, nrows=max_rows, engine="xlrd")
        except (ImportError, ValueError, OSError):
            try:
                df = pd.read_excel(file_path, nrows=max_rows)
            except Exception:
                raise
        if df is not None:
            blocks.append(_format_block("sheet1", df))

    full = "\n\n".join(b for b in blocks if b).strip()
    if not full:
        return low_signal_hint(file_path, kind="spreadsheet")
    return full[:MAX_CHARS]


def _apply_structured_vision_bytes(
    img_bytes: bytes,
    vision_model: str,
    merged_text: str,
    provenance: dict[str, bool],
) -> tuple[str, dict | None]:
    """Run structured vision on image bytes; prepend [Structured] block."""
    try:
        structured = _vision.describe_image_structured(img_bytes, vision_model)
        if structured is None:
            return merged_text, None
        block = structured.to_excerpt_block()
        text_out = prepend_structured_block(merged_text, block)
        signals = structured.to_signals_dict()
        provenance["structured"] = True
        return text_out, signals
    except Exception as exc:
        logger.debug("structured vision failed: %s", exc)
        return merged_text, None


def _apply_structured_vision(
    file_path: str,
    vision_model: str,
    merged_text: str,
    provenance: dict[str, bool],
) -> tuple[str, dict | None]:
    """Run structured vision when extraction confidence is low; prepend [Structured] block."""
    try:
        with open(file_path, "rb") as fh:
            img_bytes = fh.read()
        return _apply_structured_vision_bytes(img_bytes, vision_model, merged_text, provenance)
    except Exception as exc:
        logger.debug("structured vision failed for %r: %s", file_path, exc)
        return merged_text, None


def _extract_image_structured(
    file_path: str,
    vision_model: str | None = None,
    ocr: OcrRuntime | None = None,
) -> tuple[str, str, dict[str, bool], str, str]:
    if ocr is None:
        ocr = resolve_ocr_runtime(effective_tesseract_lang(None), None, True)

    ocr_text = ""
    try:
        from PIL import Image
        img = Image.open(file_path)
        raw = tesseract_image_with_runtime(img, ocr)
        raw = maybe_retry_arabic_ocr(img, raw, ocr)
        ocr_text = raw[:MAX_CHARS].strip()
    except Exception as exc:
        logger.debug("image OCR failed for %r: %s", file_path, exc)

    vision_text = ""
    run_vision = bool(vision_model) and IMAGE_VISION_ENABLE and (
        IMAGE_VISION_ALWAYS or not _image_ocr_is_actionable_for_filing(ocr_text)
    )
    if run_vision:
        try:
            with open(file_path, "rb") as fh:
                img_bytes = fh.read()
            description = _vision.describe_image_bytes(img_bytes, vision_model, purpose="filing")
            if description:
                vision_text = description[:MAX_CHARS].strip()
        except Exception as exc:
            logger.debug("image vision failed for %r: %s", file_path, exc)

    merged, source, provenance = merge_image_extraction_signals(ocr_text or None, vision_text or None)
    if merged:
        return merged, source, provenance, ocr_text, vision_text

    hint = low_signal_hint(file_path, kind="image")
    prov = {"ocr": bool(ocr_text), "vision": bool(vision_text)}
    return hint, "image_low_signal", prov, ocr_text, vision_text


def _extract_plain(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read(MAX_CHARS)


def _ocr_pdf_pages(doc, ocr: OcrRuntime) -> str:
    import fitz  # PyMuPDF
    try:
        from PIL import Image
    except ImportError:
        logger.debug("Pillow not available; skipping OCR page rendering")
        return ""

    parts: list[str] = []
    total = 0
    pages = min(doc.page_count, OCR_PAGE_LIMIT)
    for i in range(pages):
        page = doc.load_page(i)
        z = OCR_RENDER_ZOOM
        pix = page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        try:
            text = tesseract_image_with_runtime(img, ocr).strip()
        except Exception as exc:
            logger.debug("OCR failed on page %d of %r: %s — skipping page", i, getattr(doc, "name", "?"), exc)
            continue
        if not text:
            continue
        remaining = MAX_CHARS - total
        if remaining <= 0:
            break
        parts.append(text[:remaining])
        total += len(text)
    return "\n".join(parts).strip()


def _render_pdf_first_page(doc) -> bytes:
    import fitz  # noqa: F401
    page = doc.load_page(0)
    z = OCR_RENDER_ZOOM
    pix = page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
    return pix.tobytes("png")
