"""Batch property clustering — merge files about the same building/plot within a job."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

from constants import UNCERTAIN_FOLDER
from destination_path import normalize_rel_dest
from sort_signals.doc_kind import is_boat_document
from sort_signals.geo import infer_document_regions
from sort_signals.property import MINISTRY_JUSTICE_RE
from sort_structure.assist import suggest_subject_from_briefing
from sort_structure.compile import (
    ClassifyContract,
    compile_classify_contract,
    effective_template_from_config,
)
from sort_structure.property_fingerprint import (
    HURGHADA_UTILITIES_LABEL,
    PROPERTY_FALLBACK_GENERAL,
    belongs_to_egypt_portfolio_cluster,
    canonical_property_label,
    extract_property_fingerprints,
    is_false_section_building,
    looks_like_ocr_address_property,
    primary_property_id,
    property_cluster_key,
)
from sort_structure.subject_tail import sanitize_subject_tail

PORTFOLIO_CLUSTER_KEY = "egypt|hurghada_utilities"
_PORTFOLIO_SUBJECTS = frozenset({"Electricity", "Payments", "Ownership", "Contracts"})


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
            parts.append(val.strip())
    return "\n".join(parts)


def _row_fingerprints(row: dict) -> dict:
    briefing = row.get("document_briefing")
    return extract_property_fingerprints(
        _row_text(row), briefing if isinstance(briefing, str) else None
    )


def _row_country(row: dict, country_key: str) -> str:
    sv = row.get("structure_values")
    if isinstance(sv, dict):
        country = str(sv.get(country_key) or "").strip()
        if country:
            return country
    folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
    if "/" in folder:
        return folder.split("/")[0].strip()
    return ""


def _row_subject(row: dict, *, has_auto_tail: bool) -> str:
    if not has_auto_tail:
        return ""
    folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
    if folder and folder != UNCERTAIN_FOLDER and folder.count("/") >= 2:
        return folder.split("/")[2].strip()
    for key in ("structure_auto_tail", "auto_tail"):
        val = row.get(key)
        if isinstance(val, str) and val.strip():
            return sanitize_subject_tail(val) or val.strip()
    trace = row.get("decision_trace")
    if isinstance(trace, dict):
        at = trace.get("structure_auto_tail")
        if isinstance(at, str) and at.strip():
            return sanitize_subject_tail(at) or at.strip()
        assist = trace.get("structure_assist")
        if isinstance(assist, dict) and isinstance(assist.get("auto_tail"), str):
            return assist["auto_tail"]
    return ""


def _has_strong_egypt_geo(row: dict) -> bool:
    return infer_document_regions(_row_text(row)) == {"egypt"}


def _row_country_corrected(row: dict, country_key: str) -> str:
    """Row country, corrected to Egypt when the page geography is clearly Egyptian.

    Defensive mirror of the assist-layer country correction so a stray country
    (e.g. a hallucinated UAE) cannot split an otherwise-single plot cluster.
    """
    country = _row_country(row, country_key)
    if country.lower() != "egypt" and _has_strong_egypt_geo(row):
        return "Egypt"
    return country


def _resolve_subject(
    row: dict,
    *,
    has_auto_tail: bool,
    property_label: str = "",
) -> str:
    subject = _row_subject(row, has_auto_tail=has_auto_tail)
    prop = (property_label or "").strip()
    if subject and prop and subject.lower() == prop.lower():
        subject = ""
    if subject:
        return subject
    briefing = row.get("document_briefing")
    suggested = suggest_subject_from_briefing(
        briefing if isinstance(briefing, str) else None,
        text=_row_text(row),
    )
    return suggested or ""


def _row_was_reconciled(row: dict) -> bool:
    trace = row.get("decision_trace")
    return isinstance(trace, dict) and bool(trace.get("structure_reconcile"))


def _portfolio_subject_allowed(row: dict, *, has_auto_tail: bool) -> bool:
    purpose = str(row.get("primary_purpose") or "").lower()
    hay = _row_text(row)
    if is_boat_document(purpose, hay):
        return False

    subject = _resolve_subject(row, has_auto_tail=has_auto_tail)
    if subject in ("Contracts", "Correspondence"):
        fp = _row_fingerprints(row)
        if not (
            fp.get("hurghada")
            or fp.get("hurghada_portfolio")
            or fp.get("canal_company")
            or fp.get("hospital_landmark")
        ):
            return False
    if subject in _PORTFOLIO_SUBJECTS:
        return True
    if subject:
        return False
    return any(
        token in purpose
        for token in ("electric", "payment", "deposit", "utility", "ownership", "poa", "meter")
    )


def _is_specific_property(label: str) -> bool:
    return label.startswith(("Building ", "Plot ")) and " — " in label


def _pick_canonical_label(rows: list[dict], prop_key: str) -> str:
    """Pick the best property label for a cluster from document fingerprints only.

    LLM structure_values are ignored here — they may carry a fabricated label
    (e.g. the old 'Building 32 — Hospital Street' constant) that contradicts
    what the page actually states.
    """
    labels: list[str] = []
    for row in rows:
        fp = _row_fingerprints(row)
        canonical = canonical_property_label(fp)
        if canonical:
            labels.append(canonical)
    if not labels:
        return HURGHADA_UTILITIES_LABEL
    scored = sorted(
        labels,
        key=lambda s: (
            0 if _is_specific_property(s) else 1,
            0 if s == HURGHADA_UTILITIES_LABEL else 1,
            -len(s),
        ),
    )
    return scored[0]


def _rewrite_row_path(
    row: dict,
    *,
    country_key: str,
    prop_key: str,
    country: str,
    property_label: str,
    cluster_id: str,
    has_auto_tail: bool,
    cluster_source: str = "fingerprint",
) -> None:
    auto_tail = _resolve_subject(
        row, has_auto_tail=has_auto_tail, property_label=property_label
    )
    new_parts = [country, property_label]
    if has_auto_tail and auto_tail:
        new_parts.append(auto_tail)
    new_path = normalize_rel_dest("/".join(new_parts))

    sv = dict(row.get("structure_values") or {}) if isinstance(row.get("structure_values"), dict) else {}
    sv[country_key] = country
    sv[prop_key] = property_label

    row["structure_values"] = sv
    row["structure_path_provisional"] = new_path
    row["suggested_folder"] = new_path
    if row.get("final_folder"):
        row["final_folder"] = new_path

    trace = row.get("decision_trace")
    if not isinstance(trace, dict):
        trace = {}
        row["decision_trace"] = trace
    trace["structure_cluster_id"] = cluster_id
    trace["structure_property_canonical"] = property_label
    trace["structure_cluster_source"] = cluster_source
    if has_auto_tail and auto_tail:
        trace["structure_auto_tail"] = auto_tail


def _portfolio_member(row: dict, country_key: str, *, has_auto_tail: bool) -> bool:
    """Plotless Hurghada-utilities member: grouped neutrally, never given a plot.

    Rows that expose a real plot/building number are excluded here — they belong
    to their own plot-specific cluster and must keep that true label.
    """
    country = _row_country(row, country_key)
    if country.lower() != "egypt" and not _has_strong_egypt_geo(row):
        return False
    fp = _row_fingerprints(row)
    if primary_property_id(fp) is not None:
        return False
    if not _portfolio_subject_allowed(row, has_auto_tail=has_auto_tail):
        return False
    text = _row_text(row)
    subject = _resolve_subject(row, has_auto_tail=has_auto_tail)
    if belongs_to_egypt_portfolio_cluster(fp):
        return True
    sv = row.get("structure_values")
    if isinstance(sv, dict):
        prop = str(sv.get("property") or "").strip()
        if prop == HURGHADA_UTILITIES_LABEL:
            return True
        if is_false_section_building(prop, fp):
            return True
        if prop == PROPERTY_FALLBACK_GENERAL:
            if fp.get("canal_company") and fp.get("egp"):
                return True
            if fp.get("hurghada") and fp.get("egp"):
                return True
        if looks_like_ocr_address_property(prop):
            if fp.get("hurghada") or fp.get("hurghada_portfolio"):
                return True
            if MINISTRY_JUSTICE_RE.search(text) and subject == "Electricity":
                return True
    return False


def _apply_portfolio_cluster(
    rows: list[dict],
    *,
    country_key: str,
    prop_key: str,
    has_auto_tail: bool,
    rewritten_ids: set[int],
) -> int:
    members = [
        row
        for row in rows
        if id(row) not in rewritten_ids
        and _portfolio_member(row, country_key, has_auto_tail=has_auto_tail)
    ]
    if len(members) < 2:
        return 0
    cluster_id = hashlib.sha256(PORTFOLIO_CLUSTER_KEY.encode()).hexdigest()[:12]
    rewritten = 0
    for row in members:
        _rewrite_row_path(
            row,
            country_key=country_key,
            prop_key=prop_key,
            country="Egypt",
            property_label=HURGHADA_UTILITIES_LABEL,
            cluster_id=cluster_id,
            has_auto_tail=has_auto_tail,
            cluster_source="portfolio",
        )
        if id(row) not in rewritten_ids:
            rewritten_ids.add(id(row))
            rewritten += 1
    return rewritten


def finalize_structure_property_clusters(
    job: dict[str, Any], contract: ClassifyContract | None = None
) -> int:
    """
    Rewrite property segments so files about the same plot/building share one folder.

    Returns number of rows rewritten.
    """
    if contract is None:
        cfg = job.get("config") or {}
        tpl = effective_template_from_config(cfg)
        if tpl is None:
            return 0
        lang = str(cfg.get("language") or "English")
        contract = compile_classify_contract(tpl, language=lang)

    country_key = _country_key(contract)
    prop_key = _property_key(contract)
    if not country_key or not prop_key:
        return 0

    file_rows = [
        row
        for row in job.get("files") or []
        if isinstance(row, dict) and row.get("status") != "error"
    ]

    rewritten_ids: set[int] = set()
    for row in file_rows:
        if _row_was_reconciled(row):
            rewritten_ids.add(id(row))

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in file_rows:
        if id(row) in rewritten_ids:
            continue
        country = _row_country_corrected(row, country_key)
        if not country:
            continue
        fp = _row_fingerprints(row)
        key = property_cluster_key(country, fp)
        if not key:
            continue
        groups[key].append(row)

    for key, rows in groups.items():
        if len(rows) < 2:
            continue
        country = _row_country_corrected(rows[0], country_key)
        canonical = _pick_canonical_label(rows, prop_key)
        cluster_id = hashlib.sha256(key.encode()).hexdigest()[:12]
        for row in rows:
            _rewrite_row_path(
                row,
                country_key=country_key,
                prop_key=prop_key,
                country=country,
                property_label=canonical,
                cluster_id=cluster_id,
                has_auto_tail=contract.has_auto_tail,
            )
            rewritten_ids.add(id(row))

    _apply_portfolio_cluster(
        file_rows,
        country_key=country_key,
        prop_key=prop_key,
        has_auto_tail=contract.has_auto_tail,
        rewritten_ids=rewritten_ids,
    )
    return len(rewritten_ids)
