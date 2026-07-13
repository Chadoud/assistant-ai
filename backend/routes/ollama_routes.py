"""Ollama model listing, vision, and blob storage helpers."""

import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api_schemas import DeletePartialRequest, PullModelRequest
from classifier import delete_model, list_models, pull_model_stream
from ollama_storage import (
    blobs_dir,
    delete_partial_group,
    enrich_partial_groups,
    ollama_home,
    ollama_prune_cli_available,
    run_ollama_prune,
    scan_partial_groups,
    validate_digest_prefix,
)
from vision import find_vision_model, is_vision_capable, resolve_vision_model

router = APIRouter(tags=["ollama"])


@router.get("/models")
def get_models():
    return {"models": list_models()}


@router.get("/models/storage")
def get_model_storage():
    """Ollama blob cache: incomplete downloads (``*-partial*`` files) and prune CLI availability."""
    partials = enrich_partial_groups(scan_partial_groups())
    total = sum(p["total_bytes"] for p in partials)
    return {
        "ollama_home": str(ollama_home()),
        "partials": partials,
        "total_partial_bytes": total,
        "prune_cli_available": ollama_prune_cli_available(),
    }


@router.delete("/models/storage/partial")
async def remove_partial_blobs(req: DeletePartialRequest):
    """Delete one grouped partial download under ``~/.ollama/models/blobs``."""
    dp = (req.digest_prefix or "").strip()
    if not validate_digest_prefix(dp):
        raise HTTPException(status_code=400, detail="Invalid digest_prefix")
    try:
        removed, freed = await asyncio.to_thread(delete_partial_group, blobs_dir(), dp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "files_removed": removed, "bytes_freed": freed}


@router.post("/models/storage/prune")
async def prune_ollama_storage():
    """Run ``ollama prune`` when the installed CLI supports it."""
    ok, message = await asyncio.to_thread(run_ollama_prune)
    return {"ok": ok, "message": message}


@router.get("/vision/status")
def vision_status(preferred: str | None = None):
    """Installed vision models and effective resolution for UI + sorting."""
    models = list_models()
    installed = [m for m in models if is_vision_capable(m)]
    auto_m = find_vision_model(models)
    resolved = resolve_vision_model(models, preferred)
    return {
        "installed_vision_models": installed,
        "auto_model": auto_m,
        "resolved": resolved,
    }


@router.get("/sort/status")
def sort_status(preferred: str | None = None, vision_preferred: str | None = None):
    """Resolved sort + vision models for the active gateway (same logic as running jobs)."""
    from job_model_resolve import resolve_job_classify_model

    models = list_models()
    installed_vision = [m for m in models if is_vision_capable(m)]
    installed_text = [
        m
        for m in models
        if not is_vision_capable(m) and "embed" not in m.lower()
    ]
    installed_embed = [m for m in models if "embed" in m.lower()]
    return {
        "classify_model": resolve_job_classify_model(preferred),
        "vision_model": resolve_vision_model(models, vision_preferred),
        "installed_text_models": installed_text,
        "installed_vision_models": installed_vision,
        "installed_embed_models": installed_embed,
    }


@router.post("/models/pull")
async def download_model(req: PullModelRequest):
    """Stream Ollama pull progress as Server-Sent Events."""
    model = (req.model or "").strip()
    if not model:
        raise HTTPException(status_code=400, detail="Model name is required")

    def _next_pull(g):
        try:
            return next(g)
        except StopIteration:
            return None

    async def generate():
        gen = None
        try:
            gen = pull_model_stream(model)
            loop = asyncio.get_event_loop()
            while True:
                chunk = await loop.run_in_executor(None, _next_pull, gen)
                if chunk is None:
                    break
                yield f"data: {json.dumps(chunk)}\n\n"
            yield f"data: {json.dumps({'status': 'done', 'models': list_models()})}\n\n"
        except ValueError as exc:
            yield f"data: {json.dumps({'status': 'error', 'error': str(exc)})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'status': 'error', 'error': f'Failed to pull model: {exc}'})}\n\n"
        finally:
            if gen is not None:
                try:
                    gen.close()
                except Exception:
                    pass

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/models/{model:path}")
async def remove_model(model: str):
    try:
        await asyncio.to_thread(delete_model, model)
        return {"success": True, "models": list_models()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
