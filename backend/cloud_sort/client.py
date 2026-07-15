"""Cloud sort-worker HTTP client (VPS runs OCR + full analyze pipeline)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import httpx

from cloud_sort.config import cloud_sort_analyze_file_url, sort_worker_auth_header
from sort_analyze_row import SortAnalyzeParams, SortAnalyzeResult
from sort_structure.compile import ClassifyContract, classify_contract_to_mapping
from user_facing_errors import format_remote_llm_http_error

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT_S = 600.0


def _timeout_s() -> float:
    raw = os.environ.get("EXOSITES_CLOUD_SORT_WORKER_TIMEOUT_S", "").strip()
    if not raw:
        return _DEFAULT_TIMEOUT_S
    try:
        return max(30.0, float(raw))
    except ValueError:
        return _DEFAULT_TIMEOUT_S


def remote_sort_analyze_file(params: SortAnalyzeParams) -> SortAnalyzeResult:
    """
    Upload file bytes + analyze config to VPS sort-worker; returns same shape as local pipeline.
    """
    url = cloud_sort_analyze_file_url()
    if not url:
        raise RuntimeError("Cloud sort worker URL is not configured")

    cfg_payload = {
        "cfg": params.cfg,
        "existing_folders": params.existing_folders,
        "folder_contexts": params.folder_contexts,
        "threshold": params.threshold,
        "uncertain_folder": params.uncertain_folder,
        "vision_vm": params.vision_vm,
        "ocr_lang": params.ocr_lang,
        "ocr_langs": params.ocr_langs,
        "ocr_auto": params.ocr_auto,
        "structure_contract": _serialize_structure_contract(params.structure_contract),
        "source_filename": params.source_filename,
        "gmail_staged_part": params.gmail_staged_part,
        "job_id": params.job_id,
    }

    path = params.file_path
    headers = sort_worker_auth_header()

    try:
        with open(path, "rb") as fh:
            files = {"file": (os.path.basename(path) or "upload", fh, "application/octet-stream")}
            data = {"payload": json.dumps(cfg_payload, default=str)}
            with httpx.Client(timeout=_timeout_s()) as client:
                response = client.post(url, headers=headers, data=data, files=files)
    except OSError as exc:
        raise RuntimeError(f"Could not read file for cloud sort: {exc}") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Cloud sort worker unreachable: {exc}") from exc

    if response.status_code >= 400:
        detail = format_remote_llm_http_error(response.status_code, response.text[:500])
        raise RuntimeError(detail or f"Cloud sort worker HTTP {response.status_code}")

    body = response.json()
    if not isinstance(body, dict):
        raise RuntimeError("Cloud sort worker returned invalid JSON")

    return _result_from_worker_json(body)


def _serialize_structure_contract(contract: Any) -> Any:
    if contract is None:
        return None
    if isinstance(contract, ClassifyContract):
        return classify_contract_to_mapping(contract)
    if hasattr(contract, "model_dump"):
        return contract.model_dump()
    if isinstance(contract, dict):
        return contract
    return None


def _result_from_worker_json(body: dict[str, Any]) -> SortAnalyzeResult:
    if body.get("ok") is False:
        return SortAnalyzeResult(
            ok=False,
            error=str(body.get("error") or "Cloud sort failed"),
            status="error",
            approved=False,
        )
    row = body.get("result") if isinstance(body.get("result"), dict) else body
    status = str(row.get("status") or "review_ready")
    row_error = row.get("error")
    result_ok = row.get("ok") is not False and status != "error" and not row_error
    if not result_ok:
        return SortAnalyzeResult(
            ok=False,
            error=str(row_error or body.get("error") or "Cloud sort failed"),
            status="error",
            approved=False,
        )
    return SortAnalyzeResult(
        ok=True,
        error=None,
        size_bytes=int(row.get("size_bytes") or 0),
        analysis_excerpt=str(row.get("analysis_excerpt") or ""),
        extraction_source=str(row.get("extraction_source") or "unknown"),
        extraction_quality=float(row.get("extraction_quality") or 0.0),
        extraction_signals=row.get("extraction_signals") if isinstance(row.get("extraction_signals"), dict) else {},
        detected_language=row.get("detected_language"),
        document_briefing=row.get("document_briefing"),
        llm_reason=row.get("llm_reason"),
        structure_values=row.get("structure_values"),
        structure_path_provisional=row.get("structure_path_provisional"),
        candidate_scores=row.get("candidate_scores") if isinstance(row.get("candidate_scores"), list) else [],
        decision_reason=str(row.get("decision_reason") or ""),
        llm_confidence=row.get("llm_confidence"),
        rerank_top_score=row.get("rerank_top_score"),
        llm_folder_name=row.get("llm_folder_name"),
        classification_disagree=bool(row.get("classification_disagree")),
        primary_purpose=row.get("primary_purpose"),
        decision_trace=row.get("decision_trace") if isinstance(row.get("decision_trace"), dict) else {},
        suggested_folder=str(row.get("suggested_folder") or ""),
        final_folder=str(row.get("final_folder") or ""),
        confidence=float(row.get("confidence") or 0.0),
        reason=str(row.get("reason") or ""),
        rule_applied_id=row.get("rule_applied_id"),
        approved=bool(row.get("approved", False)),
        status=str(row.get("status") or "review_ready"),
        new_folder_name=row.get("new_folder_name"),
        analyze_extract_ms=row.get("analyze_extract_ms"),
        analyze_briefing_ms=float(row.get("analyze_briefing_ms") or 0.0),
        analyze_classify_ms=row.get("analyze_classify_ms"),
        want_briefing=bool(row.get("want_briefing")),
        skip_plain_briefing=bool(row.get("skip_plain_briefing")),
    )
