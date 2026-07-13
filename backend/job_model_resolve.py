"""Resolve the classify/sort model for a job — never pass an empty name to LiteLLM/Ollama."""

from __future__ import annotations

from classifier_ollama import list_models, resolve_classify_model
from constants import DEFAULT_OLLAMA_MODEL


def resolve_job_classify_model(requested: str | None) -> str:
    """
    Map the client-requested sort model to an installed text model.

    Empty requests fall back to ``DEFAULT_OLLAMA_MODEL`` (``mistral``), then to the
    first available non-vision model on the gateway/local Ollama. When the model
    list is unavailable (CI, cold start, Ollama down), trust the preferred name so
    enqueue succeeds and classify fails at call time with a clear LLM error if needed.
    """
    preferred = (requested or "").strip() or DEFAULT_OLLAMA_MODEL
    resolved = resolve_classify_model(list_models(), preferred)
    return resolved or preferred
