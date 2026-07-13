"""Tests for Gmail streaming job enqueue (preflight estimate on the job record)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from api_schemas import FileJobRequest
from routes.job_enqueue_helpers import enqueue_gmail_streaming_import_sort
from tests.path_helpers import safe_output_dir_string


@pytest.fixture
def file_job_request() -> FileJobRequest:
    return FileJobRequest(
        file_paths=[],
        output_dir=safe_output_dir_string(),
        model="m",
        mode="copy",
        language="en",
    )


@patch("routes.job_enqueue_helpers.estimate_gmail_messages_to_process", return_value=1200)
@patch("routes.job_enqueue_helpers.resolve_gmail_import_message_count", return_value=None)
def test_enqueue_gmail_streaming_sets_gmail_messages_total_estimate(
    _mock_resolve: MagicMock,
    mock_estimate: MagicMock,
    file_job_request: FileJobRequest,
) -> None:
    jobs: dict = {}

    def save_jobs(*_a, **_k) -> None:
        return None

    job_service = MagicMock()
    background_tasks = MagicMock()
    result = enqueue_gmail_streaming_import_sort(
        jobs,
        save_jobs,
        job_service,
        file_job_request,
        background_tasks,
        auto_apply=False,
        browser_staging=Path("/tmp/gmail_stage"),
        access_token="tok",
        gmail_query="in:inbox",
        max_messages=5000,
        gmail_import_content="both",
        gmail_ui_parameters_json=None,
    )
    job_id = result["job_id"]
    assert jobs[job_id]["gmail_messages_total_estimate"] == 1200
    mock_estimate.assert_called_once()
    call = mock_estimate.call_args
    assert call.kwargs["query"] == "in:inbox"
    assert call.kwargs["import_content"] == "both"
    assert call.kwargs["max_messages"] == 5000


@patch("routes.job_enqueue_helpers.estimate_gmail_messages_to_process", return_value=None)
@patch("routes.job_enqueue_helpers.resolve_gmail_import_message_count", return_value=None)
def test_enqueue_gmail_streaming_omits_estimate_when_preflight_returns_none(
    _mock_resolve: MagicMock,
    _mock_estimate: MagicMock,
    file_job_request: FileJobRequest,
) -> None:
    jobs: dict = {}

    def save_jobs(*_a, **_k) -> None:
        return None

    result = enqueue_gmail_streaming_import_sort(
        jobs,
        save_jobs,
        MagicMock(),
        file_job_request,
        MagicMock(),
        auto_apply=False,
        browser_staging=Path("/tmp/gmail_stage2"),
        access_token="tok",
        gmail_query="in:inbox",
        max_messages=10,
        gmail_import_content="text",
        gmail_ui_parameters_json=None,
    )
    job_id = result["job_id"]
    assert "gmail_messages_total_estimate" not in jobs[job_id]


@patch("routes.job_enqueue_helpers.estimate_gmail_messages_to_process")
@patch(
    "routes.job_enqueue_helpers.resolve_gmail_import_message_count",
    return_value=27_659,
)
def test_enqueue_gmail_streaming_prefers_exact_count_over_list_estimate(
    _mock_resolve: MagicMock,
    mock_estimate: MagicMock,
    file_job_request: FileJobRequest,
) -> None:
    jobs: dict = {}

    def save_jobs(*_a, **_k) -> None:
        return None

    result = enqueue_gmail_streaming_import_sort(
        jobs,
        save_jobs,
        MagicMock(),
        file_job_request,
        MagicMock(),
        auto_apply=False,
        browser_staging=Path("/tmp/gmail_stage3"),
        access_token="tok",
        gmail_query="in:anywhere",
        max_messages=9_007_199_254_740_991,
        gmail_import_content="both",
        gmail_ui_parameters_json=None,
    )
    job_id = result["job_id"]
    assert jobs[job_id]["gmail_messages_total_estimate"] == 27_659
    mock_estimate.assert_not_called()
