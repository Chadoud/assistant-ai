"""
Normalized relative destination paths under the output root (e.g. Career/Job Applications).

Used by the classifier, rules, sorter, and job seeding. Segments are sanitized; depth is capped.
"""

from __future__ import annotations

import os
import pathlib
import re
from typing import Final

from constants import UNCERTAIN_FOLDER

MAX_REL_DEST_SEGMENTS: Final[int] = 3
MAX_SEGMENT_CHARS: Final[int] = 60

# Windows device names — invalid as a single path segment.
_WINDOWS_DEVICE_NAMES: Final[frozenset[str]] = frozenset(
    {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        *(f"COM{i}" for i in range(1, 10)),
        *(f"LPT{i}" for i in range(1, 10)),
    }
)


def sanitize_folder_segment(name: str) -> str:
    """One path segment: strip illegal filename characters (no slashes)."""
    name = (name or "").splitlines()[0].strip()
    name = re.sub(r'[:*?"<>|\\/]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name[:MAX_SEGMENT_CHARS]
    return name


def _segment_is_reserved(seg: str) -> bool:
    base = seg.strip().rstrip(".").upper()
    return base in _WINDOWS_DEVICE_NAMES


def normalize_rel_dest(raw: str, *, uncertain_folder: str = UNCERTAIN_FOLDER) -> str:
    """
    Normalize a user/model relative destination to Parent/Leaf form.

    - Splits on / and \\; rejects ``.``, ``..``, empty segments.
    - Sanitizes each segment; caps segment count to MAX_REL_DEST_SEGMENTS.
    - Returns ``uncertain_folder`` if anything is invalid.
    """
    if not raw or not str(raw).strip():
        return uncertain_folder
    text = str(raw).splitlines()[0].strip().replace("\\", "/")
    raw_parts = [p.strip() for p in text.split("/") if p.strip()]
    if not raw_parts:
        return uncertain_folder
    cleaned: list[str] = []
    for p in raw_parts:
        if p in (".", ".."):
            return uncertain_folder
        seg = sanitize_folder_segment(p)
        if not seg:
            return uncertain_folder
        if seg.lower() == (uncertain_folder or "").strip().lower():
            return uncertain_folder
        if _segment_is_reserved(seg):
            return uncertain_folder
        cleaned.append(seg)
    if not cleaned:
        return uncertain_folder
    if len(cleaned) > MAX_REL_DEST_SEGMENTS:
        cleaned = cleaned[:MAX_REL_DEST_SEGMENTS]
    return "/".join(cleaned)


def destination_dir(output_dir: str, rel: str) -> pathlib.Path:
    """
    Absolute directory path for a normalized relative destination.

    Resolves the result and requires it to stay under the resolved output root (M2.8).
    Escapes fall back to the uncertain bucket under the root.
    """
    root = pathlib.Path(output_dir).expanduser().resolve()
    rel_n = normalize_rel_dest(rel)
    if rel_n == UNCERTAIN_FOLDER:
        candidate = (root / UNCERTAIN_FOLDER).resolve()
    else:
        candidate = root.joinpath(*rel_n.split("/")).resolve()
    try:
        if candidate == root or candidate.is_relative_to(root):
            return candidate
    except (ValueError, OSError, RuntimeError):
        pass
    return root / UNCERTAIN_FOLDER


def list_relative_folder_paths_under_output(output_dir: str) -> list[str]:
    """
    All directory paths under ``output_dir`` as POSIX-style relative strings
    (e.g. Career/Job Applications), for classifier seeding.
    """
    root = pathlib.Path(output_dir).expanduser()
    if not root.is_dir():
        return []
    out: list[str] = []
    for dirpath, _dirnames, _filenames in os.walk(root):
        p = pathlib.Path(dirpath)
        try:
            rel = p.relative_to(root)
        except ValueError:
            continue
        if rel.parts:
            out.append("/".join(rel.parts))
    return sorted(set(out))
