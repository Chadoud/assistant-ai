"""Tests for progressive Google Drive stream job enqueue and queue handoff."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from api_schemas import DriveStreamStartRequest
from routes.job_enqueue_helpers import enqueue_drive_streaming_analyze
from tests.path_helpers import safe_output_dir_string


@pytest.fixture
def drive_stream_start_request() -> DriveStreamStartRequest:
    return DriveStreamStartRequest(
        initial_file_paths=[],
        output_dir=safe_output_dir_string(),
        model="m",
        mode="copy",
        language="en",
    )


def test_enqueue_drive_stream_creates_streaming_fields(
    drive_stream_start_request: DriveStreamStartRequest,
) -> None:
    jobs: dict = {}

    def save_jobs(*_a, **_k) -> None:
        return None

    job_service = MagicMock()
    job_service.prepare_drive_stream_queue = MagicMock()
    background_tasks = MagicMock()
    r = enqueue_drive_streaming_analyze(
        jobs,
        save_jobs,
        job_service,
        drive_stream_start_request,
        background_tasks,
        auto_apply=False,
    )
    job_id = r["job_id"]
    assert "drive_import_fetching" in jobs[job_id]
    assert jobs[job_id]["drive_import_fetching"] is True
    assert jobs[job_id]["total"] == 0
    assert jobs[job_id]["files"] == []
    assert jobs[job_id]["drive_listing_discovered"] == 0
    job_service.prepare_drive_stream_queue.assert_called_once_with(job_id)
    background_tasks.add_task.assert_called_once()
    c = background_tasks.add_task.call_args
    assert c[0][0] is job_service.run_drive_import_streaming
    assert c[0][1] == job_id
    assert c[1].get("auto_apply") is False
    assert c[1].get("initial_file_paths") == []
