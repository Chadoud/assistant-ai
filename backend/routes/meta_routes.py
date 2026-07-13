"""Health, product meta, entitlement — no job state."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from classifier_prompts import SYSTEM_PROMPT
from entitlement_gate import get_entitlement_status
from health_checks import run_readiness_checks

router = APIRouter(tags=["meta"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/ready")
def ready():
    """Dependency readiness — Ollama, local SQLite stores, disk space."""
    payload = run_readiness_checks()
    status_code = 200 if payload["status"] == "ok" else 503
    return JSONResponse(payload, status_code=status_code)


@router.get("/meta/sort-prompt-default")
def sort_prompt_default():
    """Built-in Ollama system prompt for primary file classification."""
    return {"default": SYSTEM_PROMPT}


@router.get("/meta/audio")
def meta_audio():
    """Voice I/O runs in the Electron renderer; this API never receives mic or speaker streams."""
    return {
        "captures_microphone": False,
        "captures_speaker": False,
    }


@router.get("/meta/video")
def meta_video():
    """ffmpeg/ffprobe resolution + video ingest settings (see backend/.env.example)."""
    from video_extract import get_video_ingest_runtime_summary

    return get_video_ingest_runtime_summary()


@router.get("/entitlement/status")
def entitlement_status():
    """Quota + license (reads same files as Electron when EXOSITES_USER_DATA is set)."""
    return get_entitlement_status()
