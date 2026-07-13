"""Tests for LLM admission and sort concurrency alignment."""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from llm import admission as adm  # noqa: E402


def test_effective_sort_concurrency_local_ignores_slots(monkeypatch):
    monkeypatch.delenv("EXOSITES_REMOTE_LLM", raising=False)
    monkeypatch.setenv("OLLAMA_MODE", "local")
    monkeypatch.setenv("EXOSITES_SORT_MAX_CONCURRENCY", "4")
    monkeypatch.setenv("EXOSITES_LLM_MAX_SLOTS", "2")
    assert adm.effective_sort_max_concurrency() == 4


def test_effective_sort_concurrency_remote_caps_by_slots(monkeypatch):
    monkeypatch.setenv("EXOSITES_REMOTE_LLM", "1")
    monkeypatch.setenv("EXOSITES_SORT_MAX_CONCURRENCY", "8")
    monkeypatch.setenv("EXOSITES_LLM_MAX_SLOTS", "2")
    assert adm.effective_sort_max_concurrency() == 2


def test_effective_sort_concurrency_remote_no_slot_cap(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("EXOSITES_SORT_MAX_CONCURRENCY", "3")
    monkeypatch.delenv("EXOSITES_LLM_MAX_SLOTS", raising=False)
    assert adm.effective_sort_max_concurrency() == 3


def test_admission_summary_remote(monkeypatch):
    monkeypatch.setenv("EXOSITES_REMOTE_LLM", "1")
    monkeypatch.setenv("EXOSITES_SORT_MAX_CONCURRENCY", "5")
    monkeypatch.setenv("EXOSITES_LLM_MAX_SLOTS", "2")
    monkeypatch.setenv("EXOSITES_SORT_QUEUE_URL", "https://llm.example.test")
    summary = adm.admission_summary()
    assert summary["remote"] is True
    assert summary["llm_max_slots"] == 2
    assert summary["sort_max_concurrency_effective"] == 2
    assert summary["slot_limiting_enabled"] is True
    assert summary["sort_queue_enabled"] is True
