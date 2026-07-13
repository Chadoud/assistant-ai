"""Shared per-phase analyze runtime preparation for JobService workers."""

from __future__ import annotations

import asyncio
from typing import Any

from classifier import list_models
from constants import DEFAULT_JOB_LANGUAGE
from folder_catalog import filter_folders_for_classify
from ingest_tesseract import default_analyze_ocr_langs
from sort_structure.compile import compile_classify_contract, effective_template_from_config
from sorter import ensure_output_root
from vision import resolve_vision_model


async def prepare_analyze_runtime(service: Any, cfg: dict) -> dict:
    """
    Build one cached runtime bundle per analyze phase.

    This avoids recomputing existing folders, folder contexts, and model/runtime
    resolution repeatedly while processing streamed files.
    """
    raw_pref = cfg.get("vision_model")
    pref = raw_pref.strip() if isinstance(raw_pref, str) and raw_pref.strip() else None
    ollama_models = await asyncio.to_thread(list_models)
    vision_vm = resolve_vision_model(ollama_models, pref)
    raw_ocr = cfg.get("tesseract_lang")
    ocr_lang = raw_ocr.strip() if isinstance(raw_ocr, str) and raw_ocr.strip() else None
    raw_langs = cfg.get("tesseract_langs")
    ocr_langs: list[str] | None = None
    if isinstance(raw_langs, list):
        ocr_langs = [str(x).strip() for x in raw_langs if str(x).strip()]
        if not ocr_langs:
            ocr_langs = None
    ocr_auto = cfg.get("tesseract_auto")
    if ocr_auto is None:
        ocr_auto = True
    else:
        ocr_auto = bool(ocr_auto)
    if ocr_lang is None and ocr_langs is None:
        ocr_langs = default_analyze_ocr_langs()

    await asyncio.to_thread(ensure_output_root, cfg["output_dir"])
    existing_folders = service.seed_existing_folders(cfg["output_dir"])
    folder_contexts = service.context_index.get_folder_contexts()
    existing_folders, folder_contexts = filter_folders_for_classify(existing_folders, folder_contexts)
    existing_folders_lower: set[str] = {e.strip().lower() for e in existing_folders}
    thr = (
        float(cfg["min_confidence"])
        if cfg.get("min_confidence") is not None
        else service.confidence_threshold
    )
    job_lang = cfg.get("language")
    if not isinstance(job_lang, str) or not job_lang.strip():
        job_lang = DEFAULT_JOB_LANGUAGE

    return {
        "vision_vm": vision_vm,
        "ocr_lang": ocr_lang,
        "ocr_langs": ocr_langs,
        "ocr_auto": ocr_auto,
        "existing_folders": existing_folders,
        "existing_folders_lower": existing_folders_lower,
        "folder_contexts": folder_contexts,
        "threshold": thr,
        "job_language": job_lang.strip(),
        "structure_contract": _structure_contract_for_cfg(cfg, job_lang.strip()),
    }


def _structure_contract_for_cfg(cfg: dict, language: str):
    tpl = effective_template_from_config(cfg)
    if tpl is None:
        return None
    try:
        return compile_classify_contract(tpl, language=language)
    except Exception:
        return None
