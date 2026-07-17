"""
Composer attachment text extraction for chat (PDF / Office / spreadsheets / text).

Reuses :mod:`ingestor.extract_content` with vision disabled for snappy attach turns.
Scanned PDFs may still use OCR when native text is empty (ingestor behavior).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_EXTRACT_CHARS = 32_000

_APP_SECRET_NAMES = frozenset(
    {
        "settings_secrets_v1",
        "gmail_oauth.json",
        "sync_master_key.enc",
    }
)

DOCUMENT_EXTS = frozenset(
    {
        ".pdf",
        ".docx",
        ".doc",
        ".xlsx",
        ".xls",
        ".csv",
        ".txt",
        ".md",
        ".markdown",
        ".json",
        ".rtf",
        ".html",
        ".htm",
    }
)

VIDEO_EXTS = frozenset(
    {
        ".mp4",
        ".mov",
        ".m4v",
        ".avi",
        ".mkv",
        ".webm",
        ".wmv",
        ".flv",
    }
)


def _home() -> Path:
    return Path.home()


def _app_data_roots() -> list[Path]:
    roots: list[Path] = []
    for env_key in ("EXOSITES_USER_DATA", "EXOSITES_DATA_DIR"):
        raw = (os.environ.get(env_key) or "").strip()
        if not raw:
            continue
        try:
            roots.append(Path(raw).expanduser().resolve())
        except (OSError, ValueError, RuntimeError):
            continue
    return roots


def _is_blocked(resolved: Path) -> bool:
    home = _home()
    for name in (".ssh", ".gnupg", ".aws"):
        root = home / name
        try:
            if resolved == root or resolved.is_relative_to(root):
                return True
        except (ValueError, OSError):
            continue
    for ud in _app_data_roots():
        try:
            if resolved == ud or resolved.is_relative_to(ud):
                return True
        except (ValueError, OSError):
            continue
    if any(part in _APP_SECRET_NAMES for part in resolved.parts):
        try:
            if resolved.is_relative_to(home):
                return True
        except (ValueError, OSError):
            pass
    return False


def _safe_file(path_str: str) -> Path | None:
    try:
        resolved = Path(path_str).expanduser().resolve()
    except (OSError, ValueError, RuntimeError):
        return None
    try:
        if not resolved.is_relative_to(_home()) or not resolved.is_file():
            return None
    except (ValueError, OSError):
        return None
    if _is_blocked(resolved):
        return None
    return resolved


def extract_attachment_for_chat(path_str: str) -> dict[str, Any]:
    """
    Extract text for a composer document attach.

    Returns ``{ok, ...}`` — never raises to the HTTP layer.
    """
    raw = (path_str or "").strip()
    if not raw:
        return {"ok": False, "error": "path_required"}

    path = _safe_file(raw)
    if not path:
        return {"ok": False, "error": "path_not_allowed"}

    ext = path.suffix.lower()
    if ext in VIDEO_EXTS:
        return {"ok": False, "error": "video_not_supported"}
    if ext not in DOCUMENT_EXTS:
        return {"ok": False, "error": "unsupported_type", "ext": ext}

    try:
        size = path.stat().st_size
    except OSError as exc:
        return {"ok": False, "error": "stat_failed", "detail": str(exc)}

    if size <= 0:
        return {"ok": False, "error": "empty_file"}
    if size > MAX_FILE_BYTES:
        return {
            "ok": False,
            "error": "file_too_large",
            "max_bytes": MAX_FILE_BYTES,
            "size": size,
        }

    try:
        from ingestor import extract_content

        # vision_model=None → text/OCR path only (no local VLM round-trip on attach).
        payload = extract_content(str(path), vision_model=None)
    except Exception as exc:
        logger.exception("composer extract failed for %s", path.name)
        detail = str(exc).lower()
        if "password" in detail or "encrypted" in detail:
            return {"ok": False, "error": "encrypted_or_password_protected"}
        return {"ok": False, "error": "extract_failed", "detail": str(exc)[:200]}

    text = str(payload.get("text") or "").strip()
    source = str(payload.get("extraction_source") or "unknown")
    page_count = payload.get("page_count")
    pages = int(page_count) if isinstance(page_count, int) else None

    if not text:
        return {
            "ok": False,
            "error": "no_text_layer",
            "source": source,
            "pages": pages,
            "basename": path.name,
        }

    truncated = len(text) > MAX_EXTRACT_CHARS
    if truncated:
        text = text[:MAX_EXTRACT_CHARS]

    return {
        "ok": True,
        "kind": "document",
        "basename": path.name,
        "text": text,
        "truncated": truncated,
        "source": source,
        "pages": pages,
        "chars": len(text),
        "size": size,
        "previewDataUrl": _pdf_preview_data_url(path) if ext == ".pdf" else None,
    }


def _pdf_preview_data_url(path: Path) -> str | None:
    """First-page JPEG data URL for chat bubble preview (best-effort)."""
    try:
        import base64

        import fitz
    except ImportError:
        return None
    try:
        doc = fitz.open(str(path))
        try:
            if doc.page_count < 1:
                return None
            page = doc.load_page(0)
            pix = page.get_pixmap(matrix=fitz.Matrix(1.2, 1.2), alpha=False)
            jpeg = pix.tobytes("jpeg")
        finally:
            doc.close()
        b64 = base64.b64encode(jpeg).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        logger.debug("pdf preview render failed for %s", path.name, exc_info=True)
        return None
