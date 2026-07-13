"""Tests for merging local expanded paths with optional Gmail staging."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from api_schemas import GmailInlineImportOptions
from job_source_compose import (
    resolve_analyze_paths_local_only,
    resolve_analyze_paths_with_optional_gmail,
)


def test_resolve_local_only_returns_expanded_file(tmp_path: Path) -> None:
    local = tmp_path / "doc.txt"
    local.write_text("hello", encoding="utf-8")
    output = tmp_path / "sorted"
    output.mkdir()

    paths = resolve_analyze_paths_local_only([str(local)], str(output))

    assert paths == [str(local.resolve())]


@patch("gmail_import.export_gmail_messages_to_staging")
def test_resolve_with_gmail_appends_staged_paths_and_roots(
    mock_export: object,
    tmp_path: Path,
) -> None:
    local = tmp_path / "local.txt"
    local.write_text("a", encoding="utf-8")
    output = tmp_path / "out"
    output.mkdir()
    staging_root = tmp_path / "gmail_staging"
    staging_root.mkdir()
    staged_file = staging_root / "msg.txt"
    staged_file.write_text("g", encoding="utf-8")

    mock_export.return_value = ([str(staged_file.resolve())], staging_root)

    gmail = GmailInlineImportOptions(
        gmail_query="in:inbox",
        max_messages=2,
        gmail_import_content="text",
    )
    merged, roots = resolve_analyze_paths_with_optional_gmail(
        [str(local)],
        str(output),
        "access-token",
        gmail,
    )

    mock_export.assert_called_once()
    assert str(local.resolve()) in merged
    assert str(staged_file.resolve()) in merged
    assert staging_root in roots


@patch("gmail_import.export_gmail_messages_to_staging")
def test_resolve_with_gmail_only_staging_when_no_local_files(
    mock_export: object,
    tmp_path: Path,
) -> None:
    """Gmail-only contribution still yields paths when local expansion is empty."""
    output = tmp_path / "out"
    output.mkdir()
    staging_root = tmp_path / "gmail_only"
    staging_root.mkdir()
    staged = staging_root / "only.txt"
    staged.write_text("x", encoding="utf-8")
    mock_export.return_value = ([str(staged.resolve())], staging_root)

    gmail = GmailInlineImportOptions()
    merged, roots = resolve_analyze_paths_with_optional_gmail(
        [],
        str(output),
        "tok",
        gmail,
    )

    assert merged == [str(staged.resolve())]
    assert roots == [staging_root]
