"""
Expand mixed file and directory paths into a deduplicated list of file paths
for the sort job. Skips junk directories, OS metadata files (e.g. .DS_Store), and
paths under the configured output folder.
"""

from __future__ import annotations

import os
import pathlib
from typing import Iterator, Optional

from constants import DEFAULT_MAX_FILES

SKIP_DIR_NAMES: frozenset[str] = frozenset(
    {
        ".git",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "dist",
        "build",
        ".idea",
        ".svn",
    }
)

# macOS Finder, Windows Explorer, etc. — never treat as documents to classify.
SKIP_FILE_NAMES: frozenset[str] = frozenset({".DS_Store", "Thumbs.db", "desktop.ini"})

# Connector import byproducts: when a Gmail/Drive/Dropbox/… sort runs, the importer
# copies remote items into a staging folder before classifying. Those folders can end
# up inside the user's home tree, but they are NOT user documents — sweeping them into
# a "sort my local files" run would re-file import junk and mislabel a local job as
# having a Gmail/cloud source in the UI. The Gmail importer uses ``.exosites_gmail_stream``;
# every other connector uses ``<provider>_sort_staging``. Keep this in sync with
# ``CONNECTOR_PATH_MARKERS`` in ``frontend/src/components/queue/deriveSortJobSources.ts``.
GMAIL_STAGING_DIR_NAME = ".exosites_gmail_stream"
CONNECTOR_STAGING_DIR_SUFFIX = "_sort_staging"


def _is_connector_staging_dir(name: str) -> bool:
    """True when ``name`` is a connector import-staging folder (not user content)."""
    return name == GMAIL_STAGING_DIR_NAME or name.endswith(CONNECTOR_STAGING_DIR_SUFFIX)


def _is_under(path: pathlib.Path, ancestor: pathlib.Path) -> bool:
    """True if path is ancestor or inside ancestor (resolved)."""
    try:
        path.resolve().relative_to(ancestor.resolve())
        return True
    except ValueError:
        return False


def _iter_sortable_files(
    input_paths: list[str],
    output_dir: str,
) -> Iterator[str]:
    """
    Yield resolved file-path strings for every classifiable file under ``input_paths``.

    Skips junk directories, OS metadata files, paths under ``output_dir``, and duplicates.
    Imposes no cap — callers decide how to handle volume.
    """
    if not input_paths:
        return

    try:
        output_resolved = pathlib.Path(output_dir).expanduser().resolve()
    except Exception:
        output_resolved = pathlib.Path(output_dir)

    seen: set[str] = set()

    def resolved_file_key(fp: pathlib.Path) -> Optional[str]:
        fp = fp.resolve()
        if not fp.is_file():
            return None
        if fp.name in SKIP_FILE_NAMES:
            return None
        if _is_under(fp, output_resolved):
            return None
        key = str(fp)
        if key in seen:
            return None
        seen.add(key)
        return key

    for raw in input_paths:
        if not raw or not str(raw).strip():
            continue
        try:
            p = pathlib.Path(raw).expanduser().resolve()
        except Exception:
            continue
        if not p.exists():
            continue

        if p.is_file():
            key = resolved_file_key(p)
            if key is not None:
                yield key
        elif p.is_dir():
            for dirpath, dirnames, filenames in os.walk(p, topdown=True, followlinks=False):
                dirnames[:] = [
                    d
                    for d in dirnames
                    if d not in SKIP_DIR_NAMES and not _is_connector_staging_dir(d)
                ]
                for name in filenames:
                    key = resolved_file_key(pathlib.Path(dirpath) / name)
                    if key is not None:
                        yield key


def expand_input_paths(
    input_paths: list[str],
    output_dir: str,
    *,
    max_files: int = DEFAULT_MAX_FILES,
) -> tuple[list[str], Optional[str]]:
    """
    Returns (expanded_file_paths, error_message).
    error_message is set when the cap is exceeded; caller should return HTTP 400.

    Use this when the caller selected explicit paths and a hard cap is appropriate.
    For "sort everything" flows that should degrade gracefully, prefer
    :func:`expand_input_paths_capped`.
    """
    result: list[str] = []
    for key in _iter_sortable_files(input_paths, output_dir):
        if len(result) >= max_files:
            return [], f"Too many files (maximum {max_files}). Narrow the selection."
        result.append(key)
    return result, None


def expand_input_paths_capped(
    input_paths: list[str],
    output_dir: str,
    *,
    max_files: int = DEFAULT_MAX_FILES,
) -> tuple[list[str], bool]:
    """
    Like :func:`expand_input_paths` but caps the result at ``max_files`` instead of
    refusing the whole job.

    Returns (expanded_file_paths, truncated) where ``truncated`` is True when more
    sortable files exist beyond the cap. Intended for broad "sort all my files"
    requests where doing the first batch beats doing nothing.
    """
    result: list[str] = []
    truncated = False
    for key in _iter_sortable_files(input_paths, output_dir):
        if len(result) >= max_files:
            truncated = True
            break
        result.append(key)
    return result, truncated


def expand_input_paths_uncapped(input_paths: list[str], output_dir: str) -> list[str]:
    """
    Expand to every sortable file with no cap — "sort all my files" means all.

    Used by the voice ``start_local_file_sort`` flow where the user expects the
    whole selection to be filed, not a truncated batch. Junk dirs, OS metadata and
    paths under the output folder are still skipped (see :func:`_iter_sortable_files`).
    """
    return list(_iter_sortable_files(input_paths, output_dir))
