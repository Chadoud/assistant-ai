"""Tests for job_import_sources persistence."""

from job_import_sources import VALID_JOB_IMPORT_SOURCES, apply_job_import_sources


def test_apply_job_import_sources_merges_and_dedupes():
    job: dict = {"job_import_sources": ["gmail"]}
    apply_job_import_sources(job, ["google-drive", "gmail", "dropbox"])
    assert job["job_import_sources"] == ["gmail", "google-drive", "dropbox"]


def test_apply_job_import_sources_ignores_invalid():
    job: dict = {}
    apply_job_import_sources(job, ["gmail", "not-a-source", ""])
    assert job["job_import_sources"] == ["gmail"]


def test_valid_sources_match_frontend_chips():
    assert "google-drive" in VALID_JOB_IMPORT_SOURCES
    assert "dropbox" in VALID_JOB_IMPORT_SOURCES
