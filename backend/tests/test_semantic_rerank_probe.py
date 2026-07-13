"""Embedding availability is probed once; a missing model stops re-hitting Ollama."""

from __future__ import annotations

import semantic_rerank as sr


def test_missing_model_disables_after_first_call(monkeypatch):
    monkeypatch.setattr(sr, "_embeddings_available", None, raising=False)
    calls = {"n": 0}

    def _missing(model, prompt):
        calls["n"] += 1
        raise RuntimeError('model "nomic-embed-text" not found, try pulling it first')

    monkeypatch.setattr(sr, "_ollama_embeddings", _missing)

    assert sr._embed("nomic-embed-text", "hello") is None
    assert calls["n"] == 1
    # Second call short-circuits without touching Ollama again.
    assert sr._embed("nomic-embed-text", "world") is None
    assert calls["n"] == 1
    assert sr._embeddings_available is False


def test_transient_error_does_not_permanently_disable(monkeypatch):
    monkeypatch.setattr(sr, "_embeddings_available", None, raising=False)
    calls = {"n": 0}

    def _down(model, prompt):
        calls["n"] += 1
        raise RuntimeError("connection refused")

    monkeypatch.setattr(sr, "_ollama_embeddings", _down)

    assert sr._embed("nomic-embed-text", "a") is None
    assert sr._embed("nomic-embed-text", "b") is None
    # A transient failure keeps trying (availability stays unknown, not False).
    assert calls["n"] == 2
    assert sr._embeddings_available is not False


def test_success_marks_available(monkeypatch):
    monkeypatch.setattr(sr, "_embeddings_available", None, raising=False)
    monkeypatch.setattr(sr, "_ollama_embeddings", lambda model, prompt: {"embedding": [0.1, 0.2]})

    assert sr._embed("nomic-embed-text", "hi") == [0.1, 0.2]
    assert sr._embeddings_available is True
