"""Shared provider credential resolution for chat and agent-task routes."""

from __future__ import annotations

import os

from llm import provider_meta


def resolve_provider_credentials(
    provider: str,
    api_key: str | None = None,
    base_url: str | None = None,
) -> tuple[str | None, str | None]:
    """Use request-supplied key/base URL, falling back to this provider's env vars."""
    meta = provider_meta(provider)
    resolved_key = (api_key or "").strip()
    if not resolved_key and meta.env_key:
        resolved_key = os.environ.get(meta.env_key, "").strip()
    resolved_base = (base_url or "").strip()
    if not resolved_base and meta.env_base_url:
        resolved_base = os.environ.get(meta.env_base_url, "").strip()
    return (resolved_key or None, resolved_base or None)
