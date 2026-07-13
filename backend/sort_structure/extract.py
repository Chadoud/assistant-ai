"""Parse structured classification responses and merge into classify flow."""

from __future__ import annotations

import json
import re
from typing import Any

from classifier_scoring import parse_scored_response
from sort_structure.assemble import assemble_path
from sort_structure.compile import ClassifyContract


def parse_structure_response(raw: str, contract: ClassifyContract) -> dict[str, Any]:
    """
    Parse LLM JSON with theme_values; merge into standard classify result shape.

    Adds structure_values, structure_path_provisional on success.
    """
    base = parse_scored_response(raw)
    theme_values: dict[str, str] = {}
    auto_tail = ""

    try:
        blob = _extract_json_object(raw)
        if isinstance(blob.get("theme_values"), dict):
            for k, v in blob["theme_values"].items():
                if isinstance(k, str) and isinstance(v, str):
                    theme_values[k.strip()] = v.strip()
        if isinstance(blob.get("auto_tail"), str):
            auto_tail = blob["auto_tail"].strip()
        for field in ("confidence", "reason", "primary_purpose"):
            if field in blob and blob[field] is not None:
                base[field] = blob[field]
    except Exception:
        base["folder_name"] = base.get("folder_name") or ""
        base["structure_parse_failed"] = True
        return base

    path, normalized = assemble_path(contract, theme_values, auto_tail or None, [])
    base["folder_name"] = path
    base["structure_values"] = normalized
    base["structure_path_provisional"] = path
    base["llm_folder_name"] = path
    return base


def classify_scored_with_structure(
    text: str,
    existing_folders: list[str],
    contract: ClassifyContract,
    *,
    chat_fn: Any,
    system_prompt: str,
    user_message: str,
    document_briefing: str | None = None,
    doc_kind: str | None = None,
) -> dict[str, Any]:
    """Run structured classify and re-assemble path with existing folder reuse."""
    from sort_structure.assemble_classify import finalize_structure_classify

    raw = chat_fn(system_prompt, user_message)
    finalized = finalize_structure_classify(
        contract,
        raw,
        existing_folders=existing_folders,
        text=text,
        document_briefing=document_briefing,
        doc_kind=doc_kind,
    )
    if finalized.get("parse_failed"):
        return {
            "folder_name": finalized["folder_name"],
            "confidence": 0.3,
            "reason": "Structure extraction failed",
            "structure_parse_failed": True,
            "decision_trace": {
                "structure_template": True,
                "structure_parse_failed": True,
            },
        }
    llm_fields = finalized.get("llm_fields") if isinstance(finalized.get("llm_fields"), dict) else {}
    parsed: dict[str, Any] = {
        "folder_name": finalized["folder_name"],
        "confidence": float(llm_fields.get("confidence", 0.5)),
        "reason": str(llm_fields.get("reason", "")),
        "primary_purpose": llm_fields.get("primary_purpose"),
        "structure_values": finalized.get("structure_values") or {},
        "structure_path_provisional": finalized.get("structure_path_provisional"),
        "llm_folder_name": finalized["folder_name"],
        "decision_trace": {
            "structure_template": True,
            "structure_parse_failed": False,
            "structure_auto_tail": finalized.get("auto_tail"),
            "structure_assist": finalized.get("structure_assist") or None,
        },
    }
    return parsed


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object")
    return json.loads(text[start : end + 1])
