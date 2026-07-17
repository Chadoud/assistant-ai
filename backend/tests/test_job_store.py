"""Tests for JobStore atomic save under missing-parent / race conditions."""

from __future__ import annotations

import shutil

from job_store import JobStore


def test_job_store_save_creates_parent_and_round_trips(tmp_path):
    path = tmp_path / "nested" / "jobs.json"
    store = JobStore(str(path))
    store.save({"a": {"status": "running"}})
    assert store.load() == {"a": {"status": "running"}}


def test_job_store_save_recovers_when_parent_removed(tmp_path):
    path = tmp_path / "nested" / "jobs.json"
    store = JobStore(str(path))
    store.save({"a": {"status": "running"}})
    shutil.rmtree(path.parent)
    store.save({"b": {"status": "done"}})
    assert store.load() == {"b": {"status": "done"}}
