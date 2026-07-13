"""
VPS sort-worker FastAPI app — OCR, ffmpeg, classify, gates on the server.

External URL (via Caddy): ``POST /v1/sort/worker/analyze-file``
Internal route after ``strip_prefix``: ``POST /analyze-file``
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from classifier import classify_candidates
from cloud_sort.config import cloud_sort_worker_url
from constants import UNCERTAIN_FOLDER
from ingestor import extract_content
from sort_analyze_row import SortAnalyzeParams, SortAnalyzeResult, run_sort_analyze_for_path
from sort_structure.compile import (
    classify_contract_from_mapping,
    compile_classify_contract,
    effective_template_from_config,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="exo-sort-worker", version="1.0.0")

_TMP_ROOT = Path(os.environ.get("SORT_WORKER_TMP_DIR", "/tmp/exo-sort-worker"))
_MAX_UPLOAD_BYTES = int(os.environ.get("SORT_WORKER_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
_TOKEN_CACHE_TTL_S = float(os.environ.get("SORT_WORKER_TOKEN_CACHE_TTL_S", "120"))
_valid_tokens_until: dict[str, float] = {}


def _safe_upload_basename(name: str | None) -> str:
    base = os.path.basename(str(name or "upload").strip()) or "upload"
    if not base or base in (".", "..") or ".." in base or "/" in base or "\\" in base:
        return "upload.bin"
    return base


def _require_auth(authorization: str | None) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="missing_token")

    now = time.monotonic()
    cached_until = _valid_tokens_until.get(token)
    if cached_until is not None and cached_until > now:
        return

    for env_key in ("SORT_WORKER_API_KEY", "LITELLM_MASTER_KEY"):
        expected = (os.environ.get(env_key) or "").strip()
        if expected and token == expected:
            _valid_tokens_until[token] = now + _TOKEN_CACHE_TTL_S
            return

    # Accept per-user virtual keys minted for cloud sort (same as LiteLLM gateway).
    from llm.ollama_client import ollama_host

    verify_url = f"{ollama_host().rstrip('/')}/v1/models"
    try:
        import httpx

        response = httpx.get(
            verify_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        if response.status_code == 200:
            _valid_tokens_until[token] = now + _TOKEN_CACHE_TTL_S
            return
    except Exception:
        logger.debug("sort-worker token verify failed", exc_info=True)

    _valid_tokens_until.pop(token, None)
    raise HTTPException(status_code=401, detail="invalid_token")


def _structure_contract_for_analyze(raw: dict[str, Any], cfg: dict[str, Any]) -> Any:
    wire = raw.get("structure_contract")
    parsed = classify_contract_from_mapping(wire)
    if parsed is not None and parsed.levels:
        return parsed
    lang = str(cfg.get("language") or "English").strip() or "English"
    tpl = effective_template_from_config(cfg)
    if tpl is None:
        return None
    try:
        return compile_classify_contract(tpl, language=lang)
    except Exception:
        return None


def _result_to_json(result: SortAnalyzeResult) -> dict[str, Any]:
    data = result.as_file_row_patch()
    data["ok"] = result.ok
    data["new_folder_name"] = result.new_folder_name
    data["want_briefing"] = result.want_briefing
    data["skip_plain_briefing"] = result.skip_plain_briefing
    return data


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "exo-sort-worker", "worker_url_hint": cloud_sort_worker_url() or None}


@app.post("/analyze-file")
async def analyze_file(
    payload: str = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    _require_auth(authorization)
    try:
        raw = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid_payload_json") from exc
    if not isinstance(raw, dict):
        raise HTTPException(status_code=422, detail="invalid_payload_shape")

    cfg = raw.get("cfg") if isinstance(raw.get("cfg"), dict) else {}
    existing_folders = raw.get("existing_folders") if isinstance(raw.get("existing_folders"), list) else []
    existing_folders_lower = {str(x).strip().lower() for x in existing_folders if str(x).strip()}
    folder_contexts = raw.get("folder_contexts") if isinstance(raw.get("folder_contexts"), dict) else {}
    threshold = float(raw.get("threshold") or 0.58)
    uncertain = str(raw.get("uncertain_folder") or UNCERTAIN_FOLDER)

    _TMP_ROOT.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_upload_basename(file.filename)
    suffix = Path(safe_name).suffix or ".bin"
    tmp_path = _TMP_ROOT / f"{uuid.uuid4().hex}{suffix}"
    try:
        size = 0
        with tmp_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="file_too_large")
                out.write(chunk)

        params = SortAnalyzeParams(
            file_path=str(tmp_path),
            cfg=cfg,
            existing_folders=[str(x) for x in existing_folders],
            existing_folders_lower=existing_folders_lower,
            folder_contexts=folder_contexts,
            threshold=threshold,
            uncertain_folder=uncertain,
            vision_vm=raw.get("vision_vm"),
            ocr_lang=raw.get("ocr_lang"),
            ocr_langs=raw.get("ocr_langs") if isinstance(raw.get("ocr_langs"), list) else None,
            ocr_auto=bool(raw.get("ocr_auto", True)),
            structure_contract=_structure_contract_for_analyze(raw, cfg),
            extract_content=extract_content,
            classify_fn=classify_candidates,
            source_filename=str(raw.get("source_filename") or safe_name),
            gmail_staged_part=raw.get("gmail_staged_part"),
            job_id=raw.get("job_id"),
        )
        result = run_sort_analyze_for_path(params)
        return JSONResponse({"ok": result.ok, "result": _result_to_json(result)})
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


@app.on_event("startup")
def _configure_remote_llm() -> None:
    os.environ.setdefault("OLLAMA_MODE", "remote")
    os.environ.setdefault("EXOSITES_REMOTE_LLM", "1")
    os.environ.setdefault("OLLAMA_HOST", "http://litellm:4000")
    logger.info(
        "sort-worker started OLLAMA_HOST=%s tmp=%s",
        os.environ.get("OLLAMA_HOST"),
        _TMP_ROOT,
    )
