"""The Conductor: turn a capability request into an ordered list of usable engines.

Given a capability (e.g. CHAT) and an optionally-preferred provider, it returns
the ordered ``Candidate`` list the relay runner should try: preferred first, then
the capability chain — keeping only providers that are actually configured (have a
key, or are local). Health/rate-limit state is checked by the runner at call time,
not here, so a momentarily-cooling provider stays in the list and is skipped only
while it's actually unavailable.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from llm import get_provider, provider_meta
from llm.base import ChatProvider

from .capabilities import Capability, chain_for

logger = logging.getLogger(__name__)


@dataclass
class Candidate:
    """One concrete, ready-to-call engine for a capability."""

    provider_id: str
    provider: ChatProvider
    model: str
    api_key: str | None
    base_url: str | None


def _resolve_key(provider_id: str, override: str | None) -> str | None:
    meta = provider_meta(provider_id)
    if override and override.strip():
        return override.strip()
    if meta.env_key:
        env_value = os.environ.get(meta.env_key, "").strip()
        if env_value:
            return env_value
    return None


def _resolve_base_url(provider_id: str, override: str | None) -> str | None:
    meta = provider_meta(provider_id)
    if override and override.strip():
        return override.strip()
    if meta.env_base_url:
        env_value = os.environ.get(meta.env_base_url, "").strip()
        if env_value:
            return env_value
    return None


def _default_model(provider_id: str, *, require_vision: bool = False) -> str | None:
    models = provider_meta(provider_id).default_models
    if models:
        return models[0]
    if require_vision and provider_id == "ollama":
        try:
            from classifier import list_models
            from vision import resolve_vision_model

            return resolve_vision_model(list_models(), None)
        except Exception:
            logger.debug("conductor: failed to resolve local vision model", exc_info=True)
    return None


def _is_usable(provider_id: str, api_key: str | None, base_url: str | None) -> bool:
    """A provider is usable if it doesn't need a key, or one is configured."""
    meta = provider_meta(provider_id)
    if meta.needs_key and not api_key:
        return False
    if meta.needs_base_url and not base_url:
        return False
    return True


def _ordered_provider_ids(capability: Capability, preferred: str | None) -> list[str]:
    chain = chain_for(capability)
    ordered: list[str] = []
    if preferred:
        ordered.append(preferred.strip().lower())
    for pid in chain:
        if pid not in ordered:
            ordered.append(pid)
    return ordered


def candidates_for(
    capability: Capability,
    *,
    preferred: str | None = None,
    preferred_model: str | None = None,
    preferred_api_key: str | None = None,
    preferred_base_url: str | None = None,
    require_tools: bool = False,
    require_vision: bool = False,
) -> list[Candidate]:
    """Build the ordered, configured candidate list for a capability.

    :param preferred: provider id to try first (e.g. the user's active provider).
    :param preferred_*: per-request overrides applied ONLY to the preferred
        provider (its key/model/base URL from the chat request); relays resolve
        their own credentials from environment variables.
    :param require_tools: drop providers that don't support tool calling.
    :param require_vision: drop providers that can't accept images (so an image is
        never routed to a text-only engine like a non-multimodal Ollama model).
    """
    preferred_id = (preferred or "").strip().lower() or None
    out: list[Candidate] = []
    for provider_id in _ordered_provider_ids(capability, preferred_id):
        is_preferred = provider_id == preferred_id
        if require_vision and not provider_meta(provider_id).supports_vision:
            continue
        api_key = _resolve_key(provider_id, preferred_api_key if is_preferred else None)
        base_url = _resolve_base_url(provider_id, preferred_base_url if is_preferred else None)
        if not _is_usable(provider_id, api_key, base_url):
            continue
        model = (
            (preferred_model.strip() if (is_preferred and preferred_model) else None)
            or _default_model(provider_id, require_vision=require_vision)
        )
        if not model:
            continue  # nothing to call without a model (e.g. unconfigured Ollama)
        provider = get_provider(provider_id)
        if require_tools and not getattr(provider, "supports_tools", False):
            continue
        out.append(Candidate(provider_id, provider, model, api_key, base_url))
    if not out:
        logger.warning("conductor: no configured candidates for capability=%s", capability)
    return out
