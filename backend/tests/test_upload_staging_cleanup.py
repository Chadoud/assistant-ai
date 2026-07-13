"""Tests for removing one or more browser / remote staging directories from job state."""

from __future__ import annotations

from pathlib import Path

from upload_staging import cleanup_browser_staging_dir, is_safe_staging_dir


def test_is_safe_accepts_drive_and_dropbox_under_exosites_user_data(tmp_path: Path, monkeypatch) -> None:
    """Electron staging lives under ``EXOSITES_USER_DATA``, not necessarily ``~/.ai-file-sorter``."""
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    hex_id = "b" * 24
    drive_job = tmp_path / "drive_sort_staging" / hex_id / "doc.pdf"
    dbx_job = tmp_path / "dropbox_sort_staging" / hex_id / "a.txt"
    assert is_safe_staging_dir(drive_job)
    assert is_safe_staging_dir(dbx_job)


def test_is_safe_accepts_onedrive_under_exosites_user_data(tmp_path: Path, monkeypatch) -> None:
    """OneDrive staging dirs share the same safety check as Drive/Dropbox."""
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    hex_id = "c" * 24
    od_job = tmp_path / "onedrive_sort_staging" / hex_id / "report.docx"
    assert is_safe_staging_dir(od_job)


def test_is_safe_accepts_all_new_staging_subdirs(tmp_path: Path, monkeypatch) -> None:
    """Box, S3, Slack, iCloud, and Infomaniak staging dirs are allowed under EXOSITES_USER_DATA."""
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    hex_id = "d" * 24
    new_sources = [
        "outlook_sort_staging",
        "box_sort_staging",
        "s3_sort_staging",
        "slack_sort_staging",
        "icloud_sort_staging",
        "infomaniak_sort_staging",
    ]
    for subdir in new_sources:
        candidate = tmp_path / subdir / hex_id / "file.pdf"
        assert is_safe_staging_dir(candidate), f"Expected {subdir} to be a safe staging dir"


def test_cleanup_removes_legacy_dir_and_list_dirs(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    legacy = tmp_path / "browser_uploads" / "legacy_upload"
    extra = tmp_path / "gmail_export" / "batch1"
    legacy.mkdir(parents=True)
    extra.mkdir(parents=True)
    (legacy / "a.txt").write_text("1", encoding="utf-8")
    (extra / "b.txt").write_text("2", encoding="utf-8")

    job: dict = {
        "_browser_staging_dir": str(legacy),
        "_browser_staging_dirs": [str(extra), str(extra)],
    }
    cleanup_browser_staging_dir(job)

    assert not legacy.is_dir()
    assert not extra.is_dir()
    assert "_browser_staging_dir" not in job
    assert "_browser_staging_dirs" not in job


def test_cleanup_list_only(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    d1 = tmp_path / "browser_uploads" / "d1"
    d2 = tmp_path / "drive_sort_staging" / "d2"
    d1.mkdir(parents=True)
    d2.mkdir(parents=True)

    job: dict = {"_browser_staging_dirs": [str(d1), str(d2)]}
    cleanup_browser_staging_dir(job)

    assert not d1.is_dir()
    assert not d2.is_dir()


def test_cleanup_infers_drive_sort_staging_from_file_paths(tmp_path: Path, monkeypatch) -> None:
    """When ``_browser_staging_dirs`` was never set, still remove ``.../drive_sort_staging/<hex>/`` from paths."""
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    hex_id = "a" * 24
    root = tmp_path / "drive_sort_staging" / hex_id
    root.mkdir(parents=True)
    f = root / "doc.pdf"
    f.write_text("x", encoding="utf-8")
    job: dict = {
        "files": [{"path": str(f), "name": "doc.pdf"}],
    }
    cleanup_browser_staging_dir(job)
    assert not root.is_dir()
