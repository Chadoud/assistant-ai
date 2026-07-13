"""Ollama client calls for model list/delete/pull (classification chat stays on ``classifier`` for test patches)."""

from __future__ import annotations

import ollama

from llm.ollama_client import list_model_names, list_models_response, require_local_admin
from vision import is_vision_capable


def list_models() -> list[str]:
    """Return names of locally available Ollama models."""
    try:
        return list_model_names()
    except Exception:
        return []


def _base_name(model: str) -> str:
    """Drop a trailing ``:latest`` tag so 'mistral-nemo:latest' compares as 'mistral-nemo'."""
    model = model.strip()
    return model[:-7] if model.endswith(":latest") else model


def resolve_classify_model(models: list[str], preferred: str | None) -> str | None:
    """
    Pick an installed text model for classification, tolerating an unavailable preference.

    Resolution order against the installed ``models``:
      1. Exact match (with or without the ``:latest`` tag).
      2. Family match — the preferred name is the stem of an installed one, so the
         ``mistral`` default maps to an installed ``mistral-nemo``.
      3. First installed non-vision model (vision-only models classify text poorly).
      4. First installed model of any kind — better than failing outright.
    Returns ``None`` only when Ollama has no models installed at all.
    """
    if not models:
        return None

    preferred = (preferred or "").strip()
    if preferred:
        p_base = _base_name(preferred)
        for m in models:
            if m == preferred or _base_name(m) == p_base:
                return m
        for m in models:
            if _base_name(m).startswith(p_base):
                return m

    for m in models:
        if not is_vision_capable(m):
            return m
    return models[0]


def delete_model(model: str) -> None:
    """Remove a model from the local Ollama store."""
    require_local_admin()
    model = (model or "").strip()
    if not model:
        raise ValueError("Model name is required")
    ollama.delete(model=model)


def pull_model(model: str) -> None:
    """Download a model into local Ollama store (blocking, no progress). For tests/scripts only."""
    require_local_admin()
    model = (model or "").strip()
    if not model:
        raise ValueError("Model name is required")
    ollama.pull(model=model, stream=False)


def pull_model_stream(model: str):
    """Download a model, yielding plain progress dicts for SSE streaming."""
    require_local_admin()
    model = (model or "").strip()
    if not model:
        raise ValueError("Model name is required")
    for chunk in ollama.pull(model=model, stream=True):
        if hasattr(chunk, "model_dump"):
            yield chunk.model_dump()
        elif hasattr(chunk, "dict"):
            yield chunk.dict()
        elif hasattr(chunk, "__dict__"):
            yield {k: v for k, v in vars(chunk).items() if not k.startswith("_")}
        else:
            yield dict(chunk)


def list_models_raw() -> dict:
    """Full Ollama list payload (routes / diagnostics)."""
    return list_models_response()
