"""Batch structure reconciliation — one LLM call per job for cross-file consistency."""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from constants import (
    DEFAULT_OLLAMA_MODEL,
    OLLAMA_CHAT_OPTIONS,
    STRUCTURE_BATCH_RECONCILE_ENABLE,
    STRUCTURE_BATCH_RECONCILE_MIN_FILES,
    STRUCTURE_BATCH_RECONCILE_MIN_LOW_CONF,
    UNCERTAIN_FOLDER,
)
from llm.ollama_client import chat
from sort_structure.assemble_classify import finalize_structure_from_values
from sort_structure.compile import (
    ClassifyContract,
    compile_classify_contract,
    effective_template_from_config,
)
from sort_structure.extract import _extract_json_object

logger = logging.getLogger(__name__)

_RECONCILE_SYSTEM = (
    "You reconcile file-sorting decisions for a batch of related documents. "
    "Each row is an anonymized index with current country/property/subject guesses and excerpts. "
    "Merge rows that belong to the same property (same plot, building, or utility account). "
    "Mark outliers (passports, unrelated receipts, POAs for different apartments) with outlier=true "
    "and keep their country/property accurate — do not force them into a utility cluster. "
    "Output ONLY valid JSON: {\"rows\": [{\"index\": 0, \"country\": \"...\", \"property\": \"...\", "
    "\"subject\": \"...\", \"confidence\": 0.0-1.0, \"outlier\": false}]}. "
    "Use English folder segment names. Subject may be empty when not applicable."
)


def _country_key(contract: ClassifyContract) -> str | None:
    for lv in contract.levels:
        if lv.theme == "country":
            return lv.key
        if lv.theme == "auto":
            break
    return None


def _property_key(contract: ClassifyContract) -> str | None:
    for lv in contract.levels:
        if lv.theme == "property":
            return lv.key
        if lv.theme == "auto":
            break
    return None


def _row_text(row: dict) -> str:
    parts: list[str] = []
    for key in ("analysis_excerpt", "document_briefing", "reason", "primary_purpose"):
        val = row.get(key)
        if isinstance(val, str) and val.strip():
            parts.append(val.strip()[:800])
    return "\n".join(parts)


def _row_auto_tail(row: dict) -> str:
    folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
    if folder and folder != UNCERTAIN_FOLDER and folder.count("/") >= 2:
        return folder.split("/")[2].strip()
    trace = row.get("decision_trace")
    if isinstance(trace, dict):
        at = trace.get("structure_auto_tail")
        if isinstance(at, str) and at.strip():
            return at.strip()
    return ""


def _existing_folders_from_job(job: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for row in job.get("files") or []:
        if not isinstance(row, dict):
            continue
        folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
        if not folder or folder.lower() == UNCERTAIN_FOLDER.lower():
            continue
        top = folder.split("/")[0].strip()
        if top and top.lower() not in seen:
            seen.add(top.lower())
            out.append(top)
    return out


def _eligible_rows(job: dict) -> list[dict]:
    return [
        row
        for row in job.get("files") or []
        if isinstance(row, dict) and row.get("status") != "error"
    ]


def should_skip_batch_reconcile(job: dict, contract: ClassifyContract | None) -> bool:
    if not STRUCTURE_BATCH_RECONCILE_ENABLE or contract is None or not contract.levels:
        return True
    rows = _eligible_rows(job)
    if len(rows) < int(STRUCTURE_BATCH_RECONCILE_MIN_FILES):
        return True
    low_conf = float(STRUCTURE_BATCH_RECONCILE_MIN_LOW_CONF)
    needs_reconcile = any(float(row.get("confidence") or 0.0) < low_conf for row in rows)
    uncertain = any(
        str(row.get("final_folder") or row.get("suggested_folder") or "").strip().lower()
        == UNCERTAIN_FOLDER.lower()
        for row in rows
    )
    return not (needs_reconcile or uncertain)


def _majority_batch_country(rows: list[dict], country_key: str) -> str | None:
    counts: dict[str, int] = {}
    for row in rows:
        sv = row.get("structure_values") if isinstance(row.get("structure_values"), dict) else {}
        country = str(sv.get(country_key) or "").strip()
        if not country or country.lower() == UNCERTAIN_FOLDER.lower():
            continue
        counts[country] = counts.get(country, 0) + 1
    if not counts:
        return None
    best = max(counts.items(), key=lambda item: item[1])
    if best[1] < 2:
        return None
    return best[0]


def _build_reconcile_prompt(
    rows: list[dict], contract: ClassifyContract, *, majority_country: str | None = None
) -> str:
    country_key = _country_key(contract) or "country"
    prop_key = _property_key(contract) or "property"
    lines: list[str] = []
    for idx, row in enumerate(rows):
        sv = row.get("structure_values") if isinstance(row.get("structure_values"), dict) else {}
        country = str(sv.get(country_key) or "").strip()
        prop = str(sv.get(prop_key) or "").strip()
        subject = _row_auto_tail(row)
        briefing = str(row.get("document_briefing") or "")[:400]
        excerpt = str(row.get("analysis_excerpt") or "")[:400]
        purpose = str(row.get("primary_purpose") or "")[:120]
        doc_kind = str(row.get("doc_kind") or "")[:80]
        conf = float(row.get("confidence") or 0.0)
        lines.append(
            f"Row {idx}: country={country!r} property={prop!r} subject={subject!r} "
            f"confidence={conf:.2f} doc_kind={doc_kind!r} purpose={purpose!r}\n"
            f"briefing: {briefing}\nexcerpt: {excerpt}"
        )
    level_desc = ", ".join(f"{lv.key} ({lv.theme})" for lv in contract.levels)
    majority_line = ""
    if majority_country:
        majority_line = (
            f"Batch majority country (utility cluster hint, not for passport outliers): "
            f"{majority_country}.\n"
        )
    return (
        f"Template levels: {level_desc}. has_auto_tail={contract.has_auto_tail}.\n"
        f"{majority_line}"
        "Reconcile these rows (indices are anonymous; no filenames):\n\n"
        + "\n\n---\n\n".join(lines)
    )


def _parse_reconcile_response(raw: str) -> list[dict[str, Any]]:
    try:
        blob = _extract_json_object(raw)
    except Exception:
        return []
    rows = blob.get("rows")
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "index": idx,
                "country": str(item.get("country") or "").strip(),
                "property": str(item.get("property") or "").strip(),
                "subject": str(item.get("subject") or "").strip(),
                "confidence": float(item.get("confidence", 0.5)),
                "outlier": bool(item.get("outlier")),
            }
        )
    return out


def _reconcile_cluster_id(country: str, property_label: str) -> str:
    key = f"{country.strip().lower()}|{property_label.strip().lower()}"
    return hashlib.sha256(key.encode()).hexdigest()[:12]


def _row_filename_tokens(row: dict) -> list[str]:
    signals = row.get("extraction_signals")
    if not isinstance(signals, dict):
        return []
    tokens = signals.get("filename_tokens")
    if not isinstance(tokens, list):
        return []
    return [str(t) for t in tokens if isinstance(t, str) and str(t).strip()]


def _row_extraction_confidence(row: dict) -> float | None:
    signals = row.get("extraction_signals")
    if isinstance(signals, dict) and signals.get("extraction_confidence") is not None:
        try:
            return float(signals["extraction_confidence"])
        except (TypeError, ValueError):
            pass
    try:
        return float(row.get("extraction_quality"))
    except (TypeError, ValueError):
        return None


def _row_structured_vision(row: dict) -> dict[str, Any] | None:
    signals = row.get("extraction_signals")
    if not isinstance(signals, dict):
        return None
    sv = signals.get("structured_vision")
    return sv if isinstance(sv, dict) else None


def _row_extraction_quality(row: dict) -> float | None:
    try:
        return float(row.get("extraction_quality"))
    except (TypeError, ValueError):
        return None


def _apply_reconcile_row(
    row: dict,
    *,
    contract: ClassifyContract,
    country_key: str,
    prop_key: str,
    country: str,
    property_label: str,
    subject: str,
    existing_folders: list[str],
    cluster_id: str,
) -> bool:
    theme_in: dict[str, str] = {}
    if country:
        theme_in[country_key] = country
    if property_label:
        theme_in[prop_key] = property_label
    auto_tail = subject if contract.has_auto_tail else None

    finalized = finalize_structure_from_values(
        contract,
        theme_in,
        auto_tail,
        existing_folders=existing_folders,
        text=_row_text(row),
        document_briefing=row.get("document_briefing") if isinstance(row.get("document_briefing"), str) else None,
        doc_kind=row.get("doc_kind") if isinstance(row.get("doc_kind"), str) else None,
        document_language=row.get("detected_language") if isinstance(row.get("detected_language"), str) else None,
        structured_vision=_row_structured_vision(row),
        filename_tokens=_row_filename_tokens(row),
        extraction_confidence=_row_extraction_confidence(row),
        extraction_quality=_row_extraction_quality(row),
        structure_sort=True,
        reconcile_country_hint=country or None,
    )
    path = str(finalized.get("folder_name") or UNCERTAIN_FOLDER)
    row["structure_values"] = finalized.get("structure_values") or {}
    row["structure_path_provisional"] = path
    row["suggested_folder"] = path
    row["final_folder"] = path
    trace = dict(row.get("decision_trace") or {}) if isinstance(row.get("decision_trace"), dict) else {}
    trace["structure_reconcile"] = True
    trace["structure_assist"] = finalized.get("structure_assist") or {}
    if finalized.get("auto_tail"):
        trace["structure_auto_tail"] = finalized["auto_tail"]
    trace["structure_cluster_id"] = cluster_id
    trace["structure_cluster_source"] = "reconcile"
    trace["structure_property_canonical"] = property_label
    row["decision_trace"] = trace
    return True


def reconcile_structure_batch(
    job: dict[str, Any],
    contract: ClassifyContract | None = None,
    *,
    model: str | None = None,
) -> dict[str, Any]:
    """
    One LLM call per job to merge property clusters and fix cross-file outliers.

    Returns telemetry dict with keys: ran, rewritten, skipped_reason, error.
    Also stores the same dict on ``job["structure_batch_finalize"]`` when job is mutable.
    """
    telemetry: dict[str, Any] = {
        "ran": False,
        "rewritten": 0,
        "skipped_reason": None,
        "error": None,
    }

    def _finish() -> dict[str, Any]:
        job["structure_batch_finalize"] = dict(telemetry)
        return dict(telemetry)

    if contract is None:
        cfg = job.get("config") or {}
        tpl = effective_template_from_config(cfg)
        if tpl is None:
            telemetry["skipped_reason"] = "no_template"
            return _finish()
        lang = str(cfg.get("language") or "English")
        contract = compile_classify_contract(tpl, language=lang)

    if should_skip_batch_reconcile(job, contract):
        telemetry["skipped_reason"] = "skip_conditions"
        return _finish()

    country_key = _country_key(contract)
    prop_key = _property_key(contract)
    if not country_key or not prop_key:
        telemetry["skipped_reason"] = "missing_levels"
        return _finish()

    rows = _eligible_rows(job)
    majority_country = _majority_batch_country(rows, country_key)
    user_prompt = _build_reconcile_prompt(rows, contract, majority_country=majority_country)
    m = (model or DEFAULT_OLLAMA_MODEL).strip() or DEFAULT_OLLAMA_MODEL
    telemetry["ran"] = True

    try:
        response = chat(
            model=m,
            messages=[
                {"role": "system", "content": _RECONCILE_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            options=OLLAMA_CHAT_OPTIONS,
        )
        raw = (response.get("message") or {}).get("content", "").strip()
    except Exception as exc:
        logger.warning("batch reconcile LLM failed: %s", exc)
        telemetry["error"] = str(exc)[:240]
        return _finish()

    if not raw:
        telemetry["skipped_reason"] = "empty_llm_response"
        return _finish()

    parsed_rows = _parse_reconcile_response(raw)
    if not parsed_rows:
        telemetry["skipped_reason"] = "parse_failed"
        return _finish()

    existing_folders = _existing_folders_from_job(job)
    rewritten = 0
    cluster_groups: dict[str, str] = {}

    for item in parsed_rows:
        idx = item["index"]
        if idx < 0 or idx >= len(rows):
            continue
        row = rows[idx]
        country = item["country"]
        prop = item["property"]
        subject = item["subject"]
        if not country and not prop:
            continue

        cluster_key = f"{country}|{prop}"
        cluster_id = cluster_groups.get(cluster_key)
        if not cluster_id:
            cluster_id = _reconcile_cluster_id(country, prop or "General")
            cluster_groups[cluster_key] = cluster_id

        _apply_reconcile_row(
            row,
            contract=contract,
            country_key=country_key,
            prop_key=prop_key,
            country=country,
            property_label=prop,
            subject=subject,
            existing_folders=existing_folders,
            cluster_id=cluster_id,
        )
        rewritten += 1

    telemetry["rewritten"] = rewritten
    if majority_country:
        telemetry["majority_country"] = majority_country
    return _finish()
