"""
Merge local input paths with optional remote sources (Gmail, future Drive) for one analyze job.
"""

from __future__ import annotations

import pathlib

from api_schemas import GmailInlineImportOptions
from path_expand import expand_input_paths


def resolve_analyze_paths_with_optional_gmail(
    file_paths: list[str],
    output_dir: str,
    access_token: str,
    gmail: GmailInlineImportOptions,
) -> tuple[list[str], list[pathlib.Path]]:
    """
    Expand local paths, append Gmail staging paths, return merged paths + staging dirs to clean up.

    :raises ValueError: expand error or empty result.
    """
    from gmail_import import canonical_gmail_list_query, export_gmail_messages_to_staging

    expanded, err = expand_input_paths(file_paths, output_dir)
    if err:
        raise ValueError(err)
    merged = list(expanded)
    staging_roots: list[pathlib.Path] = []
    gpaths, groot = export_gmail_messages_to_staging(
        access_token,
        query=canonical_gmail_list_query(gmail.gmail_query.strip()),
        max_messages=gmail.max_messages,
        import_content=gmail.gmail_import_content,
    )
    merged.extend(gpaths)
    staging_roots.append(groot)
    if not merged:
        raise ValueError("No files found to analyze.")
    return merged, staging_roots


def resolve_analyze_paths_local_only(file_paths: list[str], output_dir: str) -> list[str]:
    expanded, err = expand_input_paths(file_paths, output_dir)
    if err:
        raise ValueError(err)
    if not expanded:
        raise ValueError("No files found in selected paths.")
    return list(expanded)
