"""Save browser multipart uploads to disk for the same analyze pipeline as local paths."""

from __future__ import annotations

import os
import pathlib
import re
import shutil
import uuid

from fastapi import HTTPException, UploadFile

from constants import APP_STATE_DIR, DEFAULT_MAX_FILES

# Subfolder under userData: ``drive_sort_staging/<hex>`` (see Electron ``ipc.js``).
_DRIVE_STAGING_SEG = "drive_sort_staging"
_DROPBOX_STAGING_SEG = "dropbox_sort_staging"
_ONEDRIVE_STAGING_SEG = "onedrive_sort_staging"
# ``randomBytes(12).toString("hex")`` → 24 hex chars.
_STAGING_ID_RE = re.compile(r"^[0-9a-f]{24}$", re.IGNORECASE)

# Total upload size cap per request (bytes). Override with EXOSITES_MAX_UPLOAD_BYTES.
_MAX_UPLOAD_BYTES = int(os.environ.get("EXOSITES_MAX_UPLOAD_BYTES", str(250 * 1024 * 1024)))

# Top-level staging folder names allowed under each base (see Electron ``ipc.js`` download dirs).
# Keep this list in sync with assertSafeStagingDir in electron/integrations/ipc.js.
_STAGING_SUBDIR_NAMES: tuple[str, ...] = (
    "browser_uploads",
    "drive_sort_staging",
    "dropbox_sort_staging",
    "onedrive_sort_staging",
    "outlook_sort_staging",
    "box_sort_staging",
    "s3_sort_staging",
    "slack_sort_staging",
    "icloud_sort_staging",
    "infomaniak_sort_staging",
    "gmail_export",
)


def _staging_base_candidates() -> list[pathlib.Path]:
    """
    Filesystem bases for import staging.

    Electron passes ``EXOSITES_USER_DATA`` (``app.getPath("userData")``); Drive/Dropbox files are
    written under ``…/drive_sort_staging`` and ``…/dropbox_sort_staging`` there—not under
    ``~/.ai-file-sorter``. Standalone/backend-only runs keep using ``APP_STATE_DIR``.
    """
    bases: list[pathlib.Path] = []
    ud = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if ud:
        bases.append(pathlib.Path(ud).expanduser())
    bases.append(APP_STATE_DIR)
    out: list[pathlib.Path] = []
    seen_cf: set[str] = set()
    for raw in bases:
        try:
            b = raw.resolve()
        except (OSError, ValueError, RuntimeError):
            b = raw
        k = str(b).casefold()
        if k in seen_cf:
            continue
        seen_cf.add(k)
        out.append(b)
    return out


def safe_staging_roots() -> tuple[pathlib.Path, ...]:
    """Resolved allowed top-level staging trees (···/browser_uploads, ···/drive_sort_staging, …)."""
    roots: list[pathlib.Path] = []
    seen_cf: set[str] = set()
    for base in _staging_base_candidates():
        for name in _STAGING_SUBDIR_NAMES:
            p = base / name
            try:
                pr = p.resolve()
            except (OSError, ValueError, RuntimeError):
                pr = p
            k = str(pr).casefold()
            if k in seen_cf:
                continue
            seen_cf.add(k)
            roots.append(pr)
    return tuple(roots)


def is_safe_staging_dir(p: pathlib.Path) -> bool:
    """Return True only when *p* resolves to a sub-tree of one of the allowed staging roots."""
    try:
        resolved = p.resolve()
    except (OSError, ValueError, RuntimeError):
        return False
    for root in safe_staging_roots():
        try:
            root_resolved = root.resolve()
            if resolved == root_resolved or resolved.is_relative_to(root_resolved):
                return True
        except (OSError, ValueError, RuntimeError):
            continue
    return False

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._\- \u00C0-\u024F]+")


def _safe_relative_path(raw: str) -> pathlib.Path:
    """Turn upload filename (possibly with webkit relative path) into a safe relative path."""
    raw = (raw or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid upload path.")
    parts: list[str] = []
    for seg in raw.split("/"):
        s = seg.strip()
        if not s or s == "." or s == "..":
            continue
        s = _SAFE_NAME_RE.sub("_", s)
        if s:
            parts.append(s)
    if not parts:
        return pathlib.Path(f"file_{uuid.uuid4().hex[:8]}")
    return pathlib.Path(*parts)


async def save_browser_uploads(files: list[UploadFile]) -> tuple[list[str], pathlib.Path]:
    """
    Writes uploads under ``~/.ai-file-sorter/browser_uploads/<uuid>/``.

    Returns ``(absolute_file_paths, staging_root)`` for ``expand_input_paths`` and cleanup.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded.")
    if len(files) > DEFAULT_MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {DEFAULT_MAX_FILES}).")

    staging_root = APP_STATE_DIR / "browser_uploads" / uuid.uuid4().hex
    staging_root.mkdir(parents=True, exist_ok=True)

    written: list[str] = []
    total_bytes = 0
    seen_names: set[str] = set()

    try:
        for uf in files:
            rel = _safe_relative_path(uf.filename or "upload")
            dest = staging_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            key = str(dest.resolve())
            if key in seen_names:
                stem = dest.stem
                dest = dest.with_name(f"{stem}_{uuid.uuid4().hex[:6]}{dest.suffix}")
                key = str(dest.resolve())
            seen_names.add(key)

            chunk = 1024 * 1024
            size = 0
            with dest.open("wb") as out:
                while True:
                    block = await uf.read(chunk)
                    if not block:
                        break
                    size += len(block)
                    total_bytes += len(block)
                    if total_bytes > _MAX_UPLOAD_BYTES:
                        raise HTTPException(
                            status_code=413,
                            detail=f"Upload too large (max {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB total).",
                        )
                    out.write(block)
            written.append(str(dest.resolve()))
    except HTTPException:
        shutil.rmtree(staging_root, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(staging_root, ignore_errors=True)
        raise

    return written, staging_root


def _infer_hex_staging_roots_from_job_files(job: dict, segment: str) -> list[str]:
    """
    When staging dir keys are missing, derive ``…/<segment>/<24-hex>/`` job roots from file paths.
    Used for Drive/Dropbox Electron import trees.
    """
    seg_l = segment.lower()
    out: list[str] = []
    seen: set[str] = set()
    for f in job.get("files") or []:
        if not isinstance(f, dict):
            continue
        raw = str(f.get("path", "") or "").strip()
        if not raw or seg_l not in raw.replace("\\", "/").lower():
            continue
        try:
            p = pathlib.Path(raw)
        except (OSError, ValueError, RuntimeError):
            continue
        parts = p.parts
        for i, part in enumerate(parts):
            if str(part).lower() != seg_l:
                continue
            if i + 1 < len(parts) and _STAGING_ID_RE.match(str(parts[i + 1])):
                root = pathlib.Path(*parts[: i + 2])
                s = str(root)
                if s not in seen:
                    seen.add(s)
                    out.append(s)
            break
    return out


def cleanup_browser_staging_dir(job: dict) -> None:
    """
    Remove staging trees (browser uploads, Gmail export dirs, etc.) when the job no longer needs them.

    Supports legacy ``_browser_staging_dir`` and ``_browser_staging_dirs`` (list).
    """
    dirs: list[str] = []
    legacy = job.pop("_browser_staging_dir", None)
    if legacy:
        dirs.append(str(legacy))
    more = job.pop("_browser_staging_dirs", None)
    if isinstance(more, list):
        for x in more:
            if x:
                dirs.append(str(x))
    inferred = (
        _infer_hex_staging_roots_from_job_files(job, _DRIVE_STAGING_SEG)
        + _infer_hex_staging_roots_from_job_files(job, _DROPBOX_STAGING_SEG)
        + _infer_hex_staging_roots_from_job_files(job, _ONEDRIVE_STAGING_SEG)
    )
    merged = list(dict.fromkeys(dirs + inferred))
    for d in merged:
        p = pathlib.Path(d)
        if not is_safe_staging_dir(p):
            continue
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
