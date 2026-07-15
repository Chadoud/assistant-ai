"""
Enqueue the real desktop sort/classify pipeline (same as POST /sort) from Gemini voice tools.

Runs on the FastAPI event loop via ``enqueue_analyze_job_core(..., threadsafe_delivery_loop=…)``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from api_schemas import FileJobRequest
from classifier_ollama import list_models, resolve_classify_model
from constants import (
    DEFAULT_JOB_LANGUAGE,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_SORT_OUTPUT_PATH_FOR_BACKEND,
)
from job_model_resolve import resolve_job_classify_model
from llm.ollama_client import health_check, is_remote_mode
from path_expand import expand_input_paths_uncapped
from routes.job_enqueue_helpers import enqueue_analyze_job_core
from sort_desktop_defaults import SortDesktopDefaults, get_sort_desktop_defaults
from voice_job_runtime import get_voice_job_enqueue_runtime

logger = logging.getLogger(__name__)


def _home() -> Path:
    return Path.home()


def _detail_from_http(exc: HTTPException) -> str:
    d = exc.detail
    if isinstance(d, str):
        return d
    if isinstance(d, dict):
        inner = d.get("detail")
        if isinstance(inner, str):
            return inner
    return str(d)


def _normalize_sort_roots(file_paths: list[Any]) -> tuple[list[str] | None, str | None]:
    home = _home()
    roots: list[str] = []
    for entry in file_paths:
        raw = str(entry).strip()
        if not raw:
            continue
        try:
            candidate = Path(raw).expanduser()
            if not candidate.is_absolute():
                return None, "Each path must be absolute or start with ~/ ."
            resolved = candidate.resolve()
        except (OSError, ValueError, RuntimeError):
            return None, f"Invalid path: {raw!r}"

        try:
            if not resolved.is_relative_to(home):
                return None, f"Paths must stay under your home folder ({home})."
        except ValueError:
            return None, f"Paths must stay under your home folder ({home})."

        roots.append(str(resolved))

    if not roots:
        return None, "file_paths must include at least one non-empty absolute path."

    return roots, None


def _build_voice_sort_request(
    *,
    file_paths: list[str],
    output_dir: str,
    model: str,
    defaults: SortDesktopDefaults | None,
) -> FileJobRequest:
    """Merge synced desktop defaults; voice ``output_dir`` param wins when set."""
    d = defaults or SortDesktopDefaults()
    resolved_output = output_dir.strip() or d.output_dir.strip() or DEFAULT_SORT_OUTPUT_PATH_FOR_BACKEND
    vision = (d.vision_model or "").strip() or None
    return FileJobRequest(
        file_paths=file_paths,
        output_dir=resolved_output,
        model=model,
        mode=d.mode,
        language=d.language or DEFAULT_JOB_LANGUAGE,
        vision_model=vision,
        rules=list(d.rules or []),
        on_collision=d.on_collision,
        min_confidence=d.min_confidence,
        tesseract_lang=d.tesseract_lang,
        tesseract_langs=d.tesseract_langs,
        tesseract_auto=d.tesseract_auto,
        sort_system_prompt=d.sort_system_prompt,
        document_briefing_enable=d.document_briefing_enable,
        sort_structure_template=d.sort_structure_template,
    )


def _sort_model_unavailable_error() -> str:
    """Actionable copy when classify model cannot be resolved for the sort pipeline."""
    if is_remote_mode():
        probe = health_check()
        detail = str(probe.get("detail") or "").strip()
        suffix = f" ({detail})" if detail else ""
        return (
            "Cloud sort isn't connected yet. Make sure you're signed in to Exo, "
            f"then try again in a moment.{suffix}"
        )
    return (
        "No local AI model is installed for sorting. Open Settings → Models "
        "and install one (for example mistral-nemo), then try again."
    )


def _resolve_voice_sort_model() -> str | None:
    """
    Pick the classify model for voice-triggered sorts.

    Cloud subscribers use the VPS gateway (``resolve_job_classify_model``); local-only
    installs still require a model reported by Ollama.
    """
    if is_remote_mode():
        model = resolve_job_classify_model(None)
        if not health_check().get("ok"):
            return None
        return model
    return resolve_classify_model(list_models(), DEFAULT_OLLAMA_MODEL)


def start_local_file_sort(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Voice tool: enqueue a local filesystem sort job like the Sort tab ``/sort`` endpoint.

    Parameters:
        file_paths: list of absolute paths (files or directories) under the user's home folder.
        output_dir: optional destination root (same guard as HTTP). Defaults to ~/Documents/EXO Sorted Files.
        auto_apply: when true, same as ``POST /sort``; when false (default), review-first like ``POST /analyze``.
        Voice/agent must opt in to auto-apply; the Sort tab still uses HTTP ``/sort`` with auto-apply.
    """
    raw_paths = parameters.get("file_paths")
    if raw_paths is None or not isinstance(raw_paths, list):
        return {"ok": False, "error": "file_paths (non-empty array) is required"}

    roots, roots_err = _normalize_sort_roots(raw_paths)
    if roots_err:
        return {"ok": False, "error": roots_err}
    assert roots is not None

    out_raw = parameters.get("output_dir")
    output_dir = str(out_raw).strip() if isinstance(out_raw, str) else ""

    auto_apply = False
    if "auto_apply" in parameters and parameters["auto_apply"] is not None:
        auto_apply = bool(parameters["auto_apply"])

    # The Sort tab sends the user's chosen model; voice has none — resolve against
    # the VPS gateway when remote, otherwise against locally installed Ollama models.
    model = _resolve_voice_sort_model()
    if not model:
        return {"ok": False, "error": _sort_model_unavailable_error()}

    req = _build_voice_sort_request(
        file_paths=roots,
        output_dir=output_dir,
        model=model,
        defaults=get_sort_desktop_defaults(),
    )

    try:
        jobs, save_jobs, job_service, loop = get_voice_job_enqueue_runtime()
        expanded = expand_input_paths_uncapped(req.file_paths, req.output_dir)
        if not expanded:
            return {"ok": False, "error": "No files found in selected paths."}

        result = enqueue_analyze_job_core(
            jobs,
            save_jobs,
            job_service,
            req,
            auto_apply,
            expanded,
            [],
            threadsafe_delivery_loop=loop,
        )
        data = dict(result)
        data["file_count"] = len(expanded)
        return {"ok": True, "data": data}
    except RuntimeError as exc:
        logger.warning("[action] start_local_file_sort runtime not ready: %s", exc)
        return {"ok": False, "error": "Sort service is still starting — try again in a moment."}
    except HTTPException as exc:
        return {"ok": False, "error": _detail_from_http(exc)}
    except Exception as exc:
        logger.exception("start_local_file_sort")
        return {"ok": False, "error": str(exc)}
