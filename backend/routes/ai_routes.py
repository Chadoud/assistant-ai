"""
AI provider status and configuration endpoints.

GET  /ai/status   — returns which chat providers are ready
POST /ai/set-key  — set a provider's API key (and base URL) at runtime, persisted to .env
"""

from __future__ import annotations

import logging
import os
import pathlib

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from dotenv_bootstrap import writable_env_file_path
from llm import PROVIDERS, provider_meta
from llm.gemini_provider import GEMINI_CHAT_MODEL_DEFAULT

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])

# Plain-language names for each routed capability (avoids ML jargon in the UI).
_CAPABILITY_LABELS: dict[str, str] = {
    "chat": "Conversation & summaries",
    "reasoning": "Deep reasoning & planning",
    "vision": "Screen & image understanding",
    "long_context": "Very large inputs",
}


class SetKeyBody(BaseModel):
    # Legacy field: still accepted so older clients keep working.
    gemini_api_key: str = Field("", max_length=512)
    # New generic fields:
    provider: str | None = Field(default=None, max_length=50)
    api_key: str = Field("", max_length=2048)
    base_url: str | None = Field(default=None, max_length=512)


def _env_path() -> pathlib.Path:
    return writable_env_file_path()


def _secrets_managed_by_electron() -> bool:
    raw = (os.environ.get("EXOSITES_BACKEND_SECRETS_MANAGED") or "").strip().lower()
    return raw in ("1", "true", "yes", "on")


def _upsert_env(updates: dict[str, str]) -> None:
    """Set each key in os.environ and persist to backend/.env (idempotent upsert)."""
    for key, value in updates.items():
        os.environ[key] = value

    if _secrets_managed_by_electron():
        logger.debug("Skipping .env persist — secrets managed by Electron main process")
        return

    path = _env_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        existing: list[str] = []
        if path.exists():
            existing = path.read_text(encoding="utf-8").splitlines()

        remaining = dict(updates)
        out: list[str] = []
        for line in existing:
            stripped = line.strip()
            matched = next(
                (
                    key
                    for key in remaining
                    if stripped.startswith(f"{key}=") or stripped.startswith(f"# {key}=")
                ),
                None,
            )
            if matched is not None:
                out.append(f"{matched}={remaining.pop(matched)}")
            else:
                out.append(line)
        for key, value in remaining.items():
            out.append(f"{key}={value}")
        path.write_text("\n".join(out) + "\n", encoding="utf-8")
        try:
            os.chmod(path, 0o600)
        except OSError as chmod_exc:
            logger.warning("Could not set permissions on %s: %s", path, chmod_exc)
    except OSError as exc:
        # Non-fatal — values are already live in os.environ; log so it's diagnosable.
        logger.warning("Could not persist AI keys to %s: %s", path, exc)


@router.get("/ai/status")
async def ai_status() -> JSONResponse:
    """
    Returns each chat provider and its readiness, so the frontend can show badges
    and guide setup. Keeps top-level ``gemini``/``ollama`` keys for back-compat.
    """
    providers: dict[str, dict[str, object]] = {}
    for pid, meta in PROVIDERS.items():
        ready = True if not meta.needs_key else bool(os.environ.get(meta.env_key or "", "").strip())
        providers[pid] = {
            "ready": ready,
            "label": meta.label,
            "needs_key": meta.needs_key,
            "needs_base_url": meta.needs_base_url,
            "supports_tools": meta.supports_tools,
            "is_local": meta.is_local,
            "default_models": list(meta.default_models),
        }

    gemini_ready = providers.get("gemini", {}).get("ready", False)
    chat_model = os.environ.get("GEMINI_CHAT_MODEL", GEMINI_CHAT_MODEL_DEFAULT)
    return JSONResponse({
        "gemini": {"ready": gemini_ready, "chat_model": chat_model},
        "ollama": {"ready": True},
        "providers": providers,
    })


def _provider_configured(provider_id: str) -> bool:
    """True if a provider can be called (no key needed, or its key is set)."""
    meta = provider_meta(provider_id)
    if not meta.needs_key:
        return True
    return bool(os.environ.get(meta.env_key or "", "").strip())


def _recent_vision_relays(limit: int = 8) -> list[dict[str, object]]:
    """Recent provider hand-offs for vision, read from the audit log."""
    import json

    from orchestrator.audit import recent_actions

    out: list[dict[str, object]] = []
    for entry in recent_actions(60):
        if entry.action != "vision_relay":
            continue
        try:
            args = json.loads(entry.args) if entry.args else {}
        except json.JSONDecodeError:
            args = {}
        out.append({
            "ts": entry.ts,
            "from": str(args.get("from") or ""),
            "to": str(args.get("to") or ""),
            "goal": entry.goal,
        })
        if len(out) >= limit:
            break
    return out


@router.get("/ai/routing")
async def ai_routing() -> JSONResponse:
    """Per-capability relay chains with each provider's configured/healthy state.

    This is the read-only "Routing" view: it shows how the connected AIs work as one
    system — which engine leads each capability, who relays behind it, and what's ready
    right now — plus the most recent vision hand-offs so failover is visible.
    """
    from orchestrator.capabilities import CHAINS
    from orchestrator.health import REGISTRY

    capabilities: list[dict[str, object]] = []
    for capability, chain in CHAINS.items():
        providers: list[dict[str, object]] = []
        for provider_id in chain:
            meta = provider_meta(provider_id)
            configured = _provider_configured(provider_id)
            # Health is only meaningful for a configured provider; peek never
            # consumes a rate-limit token.
            healthy = REGISTRY.peek(provider_id).ok if configured else False
            providers.append({
                "id": provider_id,
                "label": meta.label,
                "configured": configured,
                "healthy": healthy,
                "supports_vision": meta.supports_vision,
                "is_local": meta.is_local,
            })
        capabilities.append({
            "capability": capability.value,
            "label": _CAPABILITY_LABELS.get(capability.value, capability.value),
            "providers": providers,
        })

    return JSONResponse({
        "capabilities": capabilities,
        "recent_vision_relays": _recent_vision_relays(),
    })


@router.post("/ai/set-key")
async def ai_set_key(body: SetKeyBody) -> JSONResponse:
    """
    Set a provider's API key (and optional base URL) at runtime and persist to
    backend/.env so it survives restarts.

    Accepts either the legacy ``{gemini_api_key}`` shape or the generic
    ``{provider, api_key, base_url}`` shape.
    """
    provider_id = (body.provider or "").strip().lower()
    if not provider_id:
        # Legacy path: only Gemini.
        provider_id = "gemini"
        key = body.gemini_api_key.strip() or body.api_key.strip()
    else:
        key = body.api_key.strip()

    meta = provider_meta(provider_id)

    if meta.needs_key and not key:
        return JSONResponse({"ok": False, "error": "empty_key"}, status_code=400)

    updates: dict[str, str] = {}
    if key and meta.env_key:
        updates[meta.env_key] = key
    if meta.needs_base_url and meta.env_base_url:
        base_url = (body.base_url or "").strip()
        if not base_url:
            return JSONResponse({"ok": False, "error": "base_url_required"}, status_code=400)
        updates[meta.env_base_url] = base_url

    if updates:
        _upsert_env(updates)

    return JSONResponse({"ok": True, "provider": provider_id})
