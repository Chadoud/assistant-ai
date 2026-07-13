"""Filter connector/staging folders from classify inputs."""

from __future__ import annotations

import re

from constants import FOLDER_CATALOG_FILTER_ENABLE

_STAGING_MARKERS = (
    ".exosites_gmail_stream",
    ".exosites_drive_stream",
    "_sort_staging",
)

_CONNECTOR_PREFIX = re.compile(r"^\.exosites_", re.IGNORECASE)


def is_connector_or_staging_folder(folder_name: str) -> bool:
    raw = (folder_name or "").strip()
    if not raw:
        return False
    lower = raw.lower().replace("\\", "/")
    if _CONNECTOR_PREFIX.match(lower.split("/")[0]):
        return True
    return any(marker in lower for marker in _STAGING_MARKERS)


def filter_folders_for_classify(
    existing_folders: list[str],
    folder_contexts: dict[str, dict] | None,
) -> tuple[list[str], dict[str, dict]]:
    if not FOLDER_CATALOG_FILTER_ENABLE:
        ctx = folder_contexts or {}
        return list(existing_folders), dict(ctx)

    kept = [f for f in existing_folders if not is_connector_or_staging_folder(f)]
    ctx_in = folder_contexts or {}
    kept_ctx = {k: v for k, v in ctx_in.items() if not is_connector_or_staging_folder(k)}
    return kept, kept_ctx
