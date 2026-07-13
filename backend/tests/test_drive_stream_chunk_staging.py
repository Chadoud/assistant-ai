"""
Integration test: POST /job/{id}/drive-stream-chunk accepts browser_staging_dir
under EXOSITES_USER_DATA for both drive_sort_staging and dropbox_sort_staging subtrees.

This ensures that if someone edits only the Electron side (ipc.js staging folder names)
or only the Python side (upload_staging._STAGING_SUBDIR_NAMES), the mismatch is caught by CI.
"""

from __future__ import annotations

import json
import pathlib
import sys

import pytest
import requests
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

HEX_JOB_ID = "a" * 24  # 24-char hex — typical Electron-generated staging folder name


def _make_drive_stream_job(job_id: str) -> dict:
    """Minimal in-memory job dict that looks like a live drive-stream job."""
    return {
        "id": job_id,
        "status": "running",
        "phase": "importing",
        "files": [],
        "total": 0,
        "drive_import_fetching": True,
        "drive_listing_discovered": 0,
        "drive_stream_incoming_ended": False,
        "_browser_staging_dirs": [],
    }


@pytest.fixture()
def client_and_job(monkeypatch, tmp_path: pathlib.Path):
    """
    Return a TestClient wired with a fake drive-stream job and EXOSITES_USER_DATA pointing
    to tmp_path so is_safe_staging_dir accepts paths under it.
    """
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    # Remove the app token so the auth middleware is a no-op; this test is about
    # staging-path validation, not the token middleware.
    monkeypatch.delenv("EXOSITES_APP_TOKEN", raising=False)

    from main import app

    # Inject a fake job and stream queue so the route can proceed past the job/queue checks.
    job_id = "drivejob001"
    fake_job = _make_drive_stream_job(job_id)
    # Patch the jobs dict on app.state
    app.state.jobs[job_id] = fake_job

    # Patch the job_service.drive_stream_queue to return a real asyncio.Queue
    import asyncio

    q: asyncio.Queue = asyncio.Queue()
    original_dsq = app.state.job_service.drive_stream_queue
    app.state.job_service.drive_stream_queue = lambda jid: q if jid == job_id else original_dsq(jid)

    yield TestClient(app, raise_server_exceptions=False), job_id, tmp_path

    # Cleanup: remove the injected job and restore drive_stream_queue
    app.state.jobs.pop(job_id, None)
    app.state.job_service.drive_stream_queue = original_dsq


def _post_chunk(client: TestClient, job_id: str, staging_dir: str) -> requests.Response:
    return client.post(
        f"/job/{job_id}/drive-stream-chunk",
        content=json.dumps({"browser_staging_dir": staging_dir, "file_paths": [], "ended": False}),
        headers={"Content-Type": "application/json"},
    )


class TestDriveStreamChunkStagingContract:
    """
    browser_staging_dir under EXOSITES_USER_DATA must be accepted (200),
    not rejected as "outside allowed staging root" (400).
    """

    def test_drive_sort_staging_accepted(self, client_and_job):
        client, job_id, tmp_path = client_and_job
        staging = tmp_path / "drive_sort_staging" / HEX_JOB_ID
        staging.mkdir(parents=True)

        r = _post_chunk(client, job_id, str(staging))
        assert r.status_code == 200, f"Expected 200 for drive_sort_staging, got {r.status_code}: {r.text}"

    def test_dropbox_sort_staging_accepted(self, client_and_job):
        client, job_id, tmp_path = client_and_job
        staging = tmp_path / "dropbox_sort_staging" / HEX_JOB_ID
        staging.mkdir(parents=True)

        r = _post_chunk(client, job_id, str(staging))
        assert r.status_code == 200, f"Expected 200 for dropbox_sort_staging, got {r.status_code}: {r.text}"

    def test_onedrive_sort_staging_accepted(self, client_and_job):
        client, job_id, tmp_path = client_and_job
        staging = tmp_path / "onedrive_sort_staging" / HEX_JOB_ID
        staging.mkdir(parents=True)

        r = _post_chunk(client, job_id, str(staging))
        assert r.status_code == 200, f"Expected 200 for onedrive_sort_staging, got {r.status_code}: {r.text}"

    def test_arbitrary_path_rejected(self, client_and_job):
        """A staging dir outside EXOSITES_USER_DATA must be rejected with 400."""
        client, job_id, tmp_path = client_and_job
        bad_dir = tmp_path.parent / "evil_staging" / HEX_JOB_ID
        bad_dir.mkdir(parents=True)

        r = _post_chunk(client, job_id, str(bad_dir))
        assert r.status_code == 400, f"Expected 400 for arbitrary path, got {r.status_code}: {r.text}"
        assert "staging" in r.text.lower()
