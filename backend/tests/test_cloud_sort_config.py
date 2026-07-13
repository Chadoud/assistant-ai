"""Cloud sort worker config flags."""

from __future__ import annotations

import pytest


def test_cloud_sort_worker_enabled_from_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    from cloud_sort.config import cloud_sort_worker_enabled

    monkeypatch.delenv("EXOSITES_SORT_SERVICE_MODE", raising=False)
    monkeypatch.setenv("EXOSITES_CLOUD_SORT_WORKER", "1")
    assert cloud_sort_worker_enabled() is True


def test_cloud_sort_worker_url_from_host(monkeypatch: pytest.MonkeyPatch) -> None:
    from cloud_sort.config import cloud_sort_analyze_file_url, cloud_sort_worker_url

    monkeypatch.delenv("EXOSITES_CLOUD_SORT_WORKER_URL", raising=False)
    monkeypatch.setenv("OLLAMA_HOST", "https://llm-staging.exosites.ch")
    assert cloud_sort_worker_url() == "https://llm-staging.exosites.ch/v1/sort/worker"
    assert (
        cloud_sort_analyze_file_url()
        == "https://llm-staging.exosites.ch/v1/sort/worker/analyze-file"
    )
