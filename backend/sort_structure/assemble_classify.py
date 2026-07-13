"""Shared structure parse + assist + assemble for classify paths."""

from __future__ import annotations

from typing import Any

from constants import UNCERTAIN_FOLDER
from sort_structure.assemble import assemble_path
from sort_structure.assist import apply_theme_assist
from sort_structure.compile import ClassifyContract
from sort_structure.extract import _extract_json_object


def finalize_structure_from_values(
    contract: ClassifyContract,
    theme_values: dict[str, str],
    auto_tail: str | None,
    *,
    existing_folders: list[str],
    text: str,
    document_briefing: str | None = None,
    doc_kind: str | None = None,
    document_language: str | None = None,
    structured_vision: dict[str, Any] | None = None,
    filename_tokens: list[str] | None = None,
    extraction_confidence: float | None = None,
    extraction_quality: float | None = None,
    structure_sort: bool = False,
    reconcile_country_hint: str | None = None,
) -> dict[str, Any]:
    """
    Apply assist + assemble from theme values (no LLM JSON parse).

    Same output shape as finalize_structure_classify on success.
    """
    theme_values, auto_tail_out, assist = apply_theme_assist(
        contract,
        theme_values,
        auto_tail or None,
        text=text,
        document_briefing=document_briefing,
        doc_kind=doc_kind,
        document_language=document_language,
        structured_vision=structured_vision,
        filename_tokens=filename_tokens,
        extraction_confidence=extraction_confidence,
        extraction_quality=extraction_quality,
        structure_sort=structure_sort,
        reconcile_country_hint=reconcile_country_hint,
    )
    path, normalized = assemble_path(
        contract, theme_values, auto_tail_out, existing_folders
    )
    return {
        "folder_name": path,
        "structure_values": normalized,
        "structure_path_provisional": path,
        "structure_assist": assist,
        "auto_tail": (auto_tail_out or "").strip() or None,
        "parse_failed": False,
        "llm_fields": {},
    }


def finalize_structure_classify(
    contract: ClassifyContract,
    raw: str,
    *,
    existing_folders: list[str],
    text: str,
    document_briefing: str | None,
    doc_kind: str | None = None,
    document_language: str | None = None,
    structured_vision: dict[str, Any] | None = None,
    filename_tokens: list[str] | None = None,
    extraction_confidence: float | None = None,
    extraction_quality: float | None = None,
    structure_sort: bool = False,
) -> dict[str, Any]:
    """
    Parse structure LLM JSON, apply deterministic assist, assemble folder path.

    Returns keys: folder_name, structure_values, structure_path_provisional,
    structure_assist, auto_tail, parse_failed (bool).
    """
    theme_values: dict[str, str] = {}
    auto_tail = ""
    parse_failed = False
    try:
        blob = _extract_json_object(raw)
        tv = blob.get("theme_values")
        if isinstance(tv, dict):
            theme_values = {str(k): str(v).strip() for k, v in tv.items() if isinstance(v, str)}
        if isinstance(blob.get("auto_tail"), str):
            auto_tail = blob["auto_tail"].strip()
    except Exception:
        parse_failed = True

    if parse_failed:
        return {
            "folder_name": UNCERTAIN_FOLDER,
            "structure_values": {},
            "structure_path_provisional": UNCERTAIN_FOLDER,
            "structure_assist": {},
            "auto_tail": None,
            "parse_failed": True,
            "llm_fields": {},
        }

    result = finalize_structure_from_values(
        contract,
        theme_values,
        auto_tail or None,
        existing_folders=existing_folders,
        text=text,
        document_briefing=document_briefing,
        doc_kind=doc_kind,
        document_language=document_language,
        structured_vision=structured_vision,
        filename_tokens=filename_tokens,
        extraction_confidence=extraction_confidence,
        extraction_quality=extraction_quality,
        structure_sort=structure_sort,
    )
    llm_fields: dict[str, Any] = {}
    try:
        blob = _extract_json_object(raw)
        for field in ("confidence", "reason", "primary_purpose"):
            if field in blob and blob[field] is not None:
                llm_fields[field] = blob[field]
    except Exception:
        pass
    result["llm_fields"] = llm_fields
    return result
