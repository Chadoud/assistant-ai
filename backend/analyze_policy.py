"""
Shared analyze-phase gating: same policy for JobService and file eval tooling.

Keeps production and offline eval aligned whenever thresholds or branches change.
"""

from __future__ import annotations

import dataclasses
import pathlib

from classifier import canonical_existing_folder
from classify_audit import geo_supports_new_folder, geographic_folder_conflict
from constants import (
    AMBIGUOUS_FOLDER_FALLBACK_LLM,
    CANDIDATE_MARGIN_THRESHOLD,
    CONFIDENCE_CAP_WHEN_TIGHT_MARGIN,
    CONFIDENCE_GATE_MIN_WHEN_DISAGREE,
    EMPTY_FOLDER,
    EXTRACTION_LOW_QUALITY_FLOOR,
    EXTRACTION_UNCERTAIN_QUALITY,
    GEO_FOLDER_GATE_ENABLE,
    LLM_RERANK_GAP_UNCERTAIN,
    LLM_TRUST_FOR_WEAK_RERANK,
    MARGIN_CONFIDENCE_GATE,
    NEW_FOLDER_MIN_QUALITY,
    RERANK_WEAK_FLOOR,
    VIDEO_FILE_EXTENSIONS,
    VISION_BACKED_QUALITY_FLOOR,
)
from destination_path import normalize_rel_dest
from ingest_image_merge import VISUAL_SECTION_TAG

_IDENTITY_DOC_KINDS = frozenset(
    {
        "passport_scan",
        "passport",
        "national_id",
        "identity_card",
        "id_card",
        "visa",
        "residence_permit",
        "drivers_license",
        "personal_identification_document",
    }
)


def is_vision_backed(extraction_source: str | None, extracted_text: str | None) -> bool:
    src = (extraction_source or "").strip().lower()
    if src not in ("image_hybrid", "image_vision"):
        return False
    body = (extracted_text or "").strip()
    return VISUAL_SECTION_TAG in body or src == "image_vision"


def parse_doc_kind_from_briefing(document_briefing: str | None) -> str | None:
    if not document_briefing:
        return None
    import re

    m = re.search(r"\(doc_kind:\s*([^)]+)\)", document_briefing, re.IGNORECASE)
    if not m:
        return None
    dk = m.group(1).strip().lower().replace(" ", "_")
    if not dk or dk == "unknown":
        return None
    return dk[:120]


def is_identity_doc_kind(doc_kind: str | None, primary_purpose: str | None = None) -> bool:
    dk = (doc_kind or "").strip().lower().replace(" ", "_")
    if dk in _IDENTITY_DOC_KINDS or any(k in dk for k in ("passport", "identity", "visa", "id_card")):
        return True
    pp = (primary_purpose or "").strip().lower()
    return any(k in pp for k in ("passport", "identity", "visa", "id card", "national id"))


def effective_quality_for_gates(
    quality_score: float,
    *,
    extraction_source: str | None,
    extracted_text: str | None,
    doc_kind: str | None,
) -> float:
    q = float(quality_score)
    if is_vision_backed(extraction_source, extracted_text) and doc_kind:
        return max(q, float(VISION_BACKED_QUALITY_FLOOR))
    if is_vision_backed(extraction_source, extracted_text):
        return max(q, float(EXTRACTION_UNCERTAIN_QUALITY))
    return q


def filename_supports_llm_escape(path: str) -> bool:
    """
    Strong filename cues when body text/OCR is weak. Lets the model's pick stand
    without forcing Uncertain—users should not have to fix extraction first.
    """
    p = pathlib.Path(path or "")
    suffix = p.suffix.lower()
    if suffix in (".ics", ".ical", ".ifb", ".vcs"):
        return True
    stem = p.stem.lower()
    name = p.name.lower()
    hay = f"{stem} {name}"
    needles = (
        "video_thumb",
        "releve",
        "relev",
        "bancaire",
        "bank",
        "iban",
        "ubs",
        "carte",
        "bail",
        "lease",
        "loyer",
        "assurance",
        "avs",
        "maladie",
        "passeport",
        "passport",
        "contrat",
        "travail",
        "certificat",
        "chomage",
        "indemnit",
        "apg",
        "police",
        "rc menage",
        "menage",
        "invite",
        "calendar",
        "appointment",
        "rendez",
        "evite",
        "dentaire",
        "easysmile",
        "invoice",
        "facture",
        "receipt",
        "payment",
        "teamviewer",
        "quark",
        "onyxceph",
        "license",
        "lizenz",
        "specification",
        "setup",
        "software",
        "update_pack",
    )
    if any(n in hay for n in needles):
        return True
    # CNC / CAM toolpath exports — weak body text, filename is the main cue.
    if suffix in (".nc", ".pts", ".cnc", ".gcode", ".tap"):
        return True
    # Intentionally no ".mp4"/etc. here: extension alone is not a subject cue; trusting
    # the LLM on weak video text was routing almost everything into Media/Videos.
    return False


def is_generic_media_destination(folder: str) -> bool:
    """
    Broad media catch-alls. With weak extraction, the model often picks these; we should
    not short-circuit gates to land files here without real content signal.
    """
    raw = normalize_rel_dest(str(folder or "")).strip().lower()
    if not raw:
        return False
    parts = [p.strip() for p in raw.split("/") if p.strip()]
    last = parts[-1] if parts else ""
    generic_leaves = {
        "videos",
        "video",
        "movies",
        "movie",
        "recordings",
        "recording",
        "clips",
        "clip",
        "home videos",
        "home video",
    }
    if last in generic_leaves:
        return True
    if len(parts) == 1 and parts[0] == "media":
        return True
    return False


def top_two_close(candidate_scores: list[dict], *, margin: float) -> bool:
    if len(candidate_scores) < 2:
        return False
    try:
        ranked = sorted(candidate_scores, key=lambda x: float(x.get("score", 0.0)), reverse=True)
        return (float(ranked[0].get("score", 0.0)) - float(ranked[1].get("score", 0.0))) < margin
    except Exception:
        return False


def is_new_folder(folder_name: str, existing_folders_lower: set[str]) -> bool:
    f = (folder_name or "").strip().lower()
    return bool(f) and f not in existing_folders_lower


def _body_supports_llm_trust_for_existing(
    *,
    file_path: str,
    low_signal: bool,
    quality_score: float,
    extraction_source: str | None,
    extracted_text: str | None = None,
) -> bool:
    """
    When the body is weak, we may still trust a high-confidence LLM pick for an
    *existing* (non-generic) folder. Video often scores low on ``estimate_quality``
    despite useful [Visual]/[Spoken] text; plain weak PDFs still rely on ``low_signal``
    or filename cues.
    """
    if low_signal or filename_supports_llm_escape(file_path):
        return True
    if is_vision_backed(extraction_source, extracted_text):
        return True
    if quality_score >= EXTRACTION_UNCERTAIN_QUALITY:
        return False
    src = (extraction_source or "").strip().lower()
    if src.startswith("video_") or src.startswith("image_"):
        return True
    return False


def _new_folder_high_trust_filename_cue(
    *,
    file_path: str,
    scored: dict,
    quality_score: float,
    uncertain_folder: str,
) -> bool:
    """
    Allow a new folder when body quality is below NEW_FOLDER_MIN_QUALITY but the
    filename is a strong domain cue (CNC, etc.) and the model is very confident.
    """
    if quality_score < EXTRACTION_UNCERTAIN_QUALITY:
        return False
    lc = scored.get("llm_confidence")
    if lc is None or float(lc) < LLM_TRUST_FOR_WEAK_RERANK:
        return False
    fn = str(scored.get("folder_name", "") or "").strip()
    llm_fn = str(scored.get("llm_folder_name", "") or "").strip()
    if not fn or fn.lower() == uncertain_folder.lower():
        return False
    if llm_fn and llm_fn.lower() != fn.lower():
        return False
    if is_generic_media_destination(fn):
        return False
    return filename_supports_llm_escape(file_path)


def _resolve_high_trust_llm_folder(
    llm_folder_name: str | None,
    *,
    llm_confidence: float | None,
    existing_folders: list[str],
    uncertain_folder: str,
) -> tuple[str | None, float | None]:
    """If the model is confident enough, return its folder (canonical when possible)."""
    if llm_confidence is None or llm_confidence < LLM_TRUST_FOR_WEAK_RERANK:
        return None, None
    raw = (llm_folder_name or "").strip()
    if not raw or raw.lower() == uncertain_folder.lower():
        return None, None
    matched = canonical_existing_folder(raw, existing_folders)
    if matched:
        return matched, llm_confidence
    return raw, llm_confidence


STRUCTURE_UNCERTAIN_CONFIDENCE_CAP = 0.5
STRUCTURE_UNCERTAIN_REASON = (
    "Couldn't determine the folder structure from this document — needs a quick look"
)


def _structure_sort_active(scored: dict) -> bool:
    trace = scored.get("decision_trace")
    if isinstance(trace, dict) and trace.get("structure_template"):
        return True
    return bool(scored.get("structure_path_provisional") or scored.get("structure_values"))


def _structure_rerank_skipped(scored: dict) -> bool:
    trace = scored.get("decision_trace")
    return isinstance(trace, dict) and bool(trace.get("structure_rerank_skipped"))


def _structure_path_segment_count(folder_name: str) -> int:
    return len([p for p in str(folder_name or "").split("/") if p.strip()])


def _structure_assist_country_source(scored: dict) -> str | None:
    trace = scored.get("decision_trace")
    if not isinstance(trace, dict):
        return None
    assist = trace.get("structure_assist")
    if not isinstance(assist, dict):
        return None
    source = assist.get("country")
    return str(source) if isinstance(source, str) and source.strip() else None


def _structure_geo_repaired_folder(
    scored: dict,
    *,
    uncertain_folder: str,
) -> str | None:
    """Return assist-corrected structure path when geo gate would conflict."""
    prov = str(scored.get("structure_path_provisional") or "").strip()
    if not prov or prov.lower() == uncertain_folder.lower():
        return None
    source = _structure_assist_country_source(scored)
    if source not in {"geo", "geo_override", "passport", "passport_override"}:
        return None
    return prov


def _structure_trust_assembled_path(
    scored: dict,
    folder_name: str,
    uncertain_folder: str,
) -> bool:
    """Trust structure-assembled multi-segment paths on moderate LLM or assist signal."""
    if not _structure_rerank_skipped(scored):
        return False
    if folder_name.strip().lower() == uncertain_folder.lower():
        return False
    if _structure_path_segment_count(folder_name) < 2:
        return False
    assist_source = _structure_assist_country_source(scored)
    if assist_source in {"geo_override", "passport_override"}:
        return _structure_path_segment_count(folder_name) >= 2
    if _structure_path_segment_count(folder_name) >= 3:
        trace = scored.get("decision_trace")
        if isinstance(trace, dict) and trace.get("structure_assist"):
            return True
    lc = scored.get("llm_confidence")
    if lc is not None and float(lc) >= 0.7:
        return True
    trace = scored.get("decision_trace")
    if isinstance(trace, dict) and trace.get("structure_assist"):
        return True
    return bool(scored.get("structure_values"))


@dataclasses.dataclass
class AnalyzeGateResult:
    folder_name: str
    confidence: float
    reason: str
    allow_weak_evidence: bool


def apply_analyze_gates(
    *,
    scored: dict,
    file_path: str,
    quality_score: float,
    low_signal: bool,
    existing_folders: list[str],
    existing_folders_lower: set[str],
    threshold: float,
    uncertain_folder: str,
    extraction_source: str | None = None,
    empty_folder: str = EMPTY_FOLDER,
    extracted_text: str | None = None,
    doc_kind: str | None = None,
) -> AnalyzeGateResult:
    """
    Apply the same post-classification gates as JobService (excluding glob rules).

    `scored` must be the dict returned by `classify_candidates` (or compatible).

    When ``quality_score`` is below :data:`EXTRACTION_UNCERTAIN_QUALITY` and no weak-text
    escape applies (filename cue or trusted existing folder), the destination is
    ``empty_folder`` (default :data:`EMPTY_FOLDER`), not ``uncertain_folder``.
    """
    body = (extracted_text or "").strip()
    vision_backed = is_vision_backed(extraction_source, body)
    effective_quality = effective_quality_for_gates(
        quality_score,
        extraction_source=extraction_source,
        extracted_text=body,
        doc_kind=doc_kind,
    )

    folder_name = str(scored.get("folder_name", uncertain_folder))
    confidence = float(scored.get("confidence", 0.0))
    reason = str(scored.get("reason", ""))
    candidate_scores: list[dict] = (
        scored.get("candidate_scores", []) if isinstance(scored.get("candidate_scores"), list) else []
    )

    llm_confidence = scored.get("llm_confidence")
    lc_f = float(llm_confidence) if llm_confidence is not None else None
    rs = scored.get("rerank_top_score")
    rs_f = float(rs) if rs is not None else None
    llm_fn_raw = scored.get("llm_folder_name")
    llm_folder_name = str(llm_fn_raw).strip() if isinstance(llm_fn_raw, str) and llm_fn_raw.strip() else None
    classification_disagree = bool(scored.get("classification_disagree"))
    structure_active = _structure_sort_active(scored)
    structure_skipped_rerank = _structure_rerank_skipped(scored)
    initial_rerank_folder = str(scored.get("folder_name", uncertain_folder)).strip()
    rerank_llm_disagreed = bool(
        llm_folder_name
        and initial_rerank_folder.lower() != llm_folder_name.lower()
    )

    matched_llm_existing: str | None = None
    if (
        lc_f is not None
        and lc_f >= LLM_TRUST_FOR_WEAK_RERANK
        and llm_folder_name
        and llm_folder_name.lower() != uncertain_folder.lower()
    ):
        matched_llm_existing = canonical_existing_folder(llm_folder_name, existing_folders)

    llm_trusts_existing_despite_weak_body = (
        matched_llm_existing is not None
        and _body_supports_llm_trust_for_existing(
            file_path=file_path,
            low_signal=low_signal,
            quality_score=effective_quality,
            extraction_source=extraction_source,
            extracted_text=body,
        )
        and not is_generic_media_destination(matched_llm_existing)
    )

    llm_trusts_vision_pick = bool(
        vision_backed
        and doc_kind
        and lc_f is not None
        and lc_f >= LLM_TRUST_FOR_WEAK_RERANK
        and llm_folder_name
        and llm_folder_name.lower() != uncertain_folder.lower()
        and not is_generic_media_destination(llm_folder_name)
    )

    if CONFIDENCE_GATE_MIN_WHEN_DISAGREE and classification_disagree:
        if lc_f is not None and rs_f is not None:
            confidence = min(lc_f, rs_f)

    if (low_signal or quality_score < EXTRACTION_LOW_QUALITY_FLOOR) and not vision_backed:
        if not llm_trusts_existing_despite_weak_body and not llm_trusts_vision_pick:
            confidence = min(confidence, EXTRACTION_LOW_QUALITY_FLOOR)
            reason = "Low OCR signal; needs review"

    cm_raw = scored.get("candidate_margin")
    if isinstance(cm_raw, (int, float)):
        cm = float(cm_raw)
        if cm < float(MARGIN_CONFIDENCE_GATE):
            confidence = min(confidence, float(CONFIDENCE_CAP_WHEN_TIGHT_MARGIN))

    allow_weak_evidence = False
    identity_doc = is_identity_doc_kind(doc_kind, str(scored.get("primary_purpose") or ""))
    if effective_quality < EXTRACTION_UNCERTAIN_QUALITY:
        llm_fn_pre = str(scored.get("llm_folder_name") or scored.get("folder_name") or "").strip()
        trust_filename = (
            lc_f is not None
            and lc_f >= LLM_TRUST_FOR_WEAK_RERANK
            and llm_fn_pre
            and llm_fn_pre.lower() != uncertain_folder.lower()
            and filename_supports_llm_escape(file_path)
        )
        trust_llm_existing = llm_trusts_existing_despite_weak_body
        trust_vision_identity = vision_backed and identity_doc and lc_f is not None and lc_f >= LLM_TRUST_FOR_WEAK_RERANK
        trust_vision_doc = vision_backed and doc_kind and lc_f is not None and lc_f >= LLM_TRUST_FOR_WEAK_RERANK
        if trust_llm_existing:
            folder_name = matched_llm_existing
            confidence = float(lc_f) if lc_f is not None else confidence
            allow_weak_evidence = True
        elif trust_vision_identity or trust_vision_doc:
            if llm_folder_name:
                folder_name = llm_folder_name
            confidence = float(lc_f) if lc_f is not None else confidence
            allow_weak_evidence = True
        elif trust_filename:
            allow_weak_evidence = True
        else:
            folder_name = empty_folder
            reason = "No usable extracted content; filed under Empty"
    elif (
        not structure_skipped_rerank
        and top_two_close(candidate_scores, margin=CANDIDATE_MARGIN_THRESHOLD)
    ):
        lc2 = lc_f
        rs2 = rs_f
        if (
            rs2 is not None
            and lc2 is not None
            and rs2 < RERANK_WEAK_FLOOR
            and lc2 >= LLM_TRUST_FOR_WEAK_RERANK
        ):
            pick, pick_conf = _resolve_high_trust_llm_folder(
                llm_folder_name,
                llm_confidence=lc2,
                existing_folders=existing_folders,
                uncertain_folder=uncertain_folder,
            )
            if pick:
                folder_name = pick
                confidence = pick_conf
            else:
                folder_name = uncertain_folder
                reason = "Ambiguous folder match; manual review required"
        elif AMBIGUOUS_FOLDER_FALLBACK_LLM:
            pick, pick_conf = _resolve_high_trust_llm_folder(
                llm_folder_name,
                llm_confidence=lc_f,
                existing_folders=existing_folders,
                uncertain_folder=uncertain_folder,
            )
            if pick:
                folder_name = pick
                confidence = pick_conf
                reason = "Close scores between top folders; kept the model pick."
            else:
                folder_name = uncertain_folder
                reason = "Ambiguous folder match; manual review required"
        else:
            folder_name = uncertain_folder
            reason = "Ambiguous folder match; manual review required"
    elif (
        is_new_folder(folder_name, existing_folders_lower)
        and effective_quality < NEW_FOLDER_MIN_QUALITY
        and not allow_weak_evidence
        and not (
            structure_skipped_rerank
            and _structure_path_segment_count(folder_name) >= 2
        )
        and not _new_folder_high_trust_filename_cue(
            file_path=file_path,
            scored=scored,
            quality_score=effective_quality,
            uncertain_folder=uncertain_folder,
        )
        and not (
            body
            and geo_supports_new_folder(body, folder_name)
            and effective_quality >= EXTRACTION_UNCERTAIN_QUALITY
        )
        and not (vision_backed and doc_kind and lc_f is not None and lc_f >= LLM_TRUST_FOR_WEAK_RERANK)
    ):
        folder_name = uncertain_folder
        reason = "New folder blocked on low-confidence evidence"
    elif confidence < threshold:
        if _structure_trust_assembled_path(scored, folder_name, uncertain_folder):
            pass
        elif llm_trusts_vision_pick and llm_folder_name:
            folder_name = llm_folder_name
            confidence = float(lc_f) if lc_f is not None else confidence
        else:
            folder_name = uncertain_folder
            reason = "Low confidence; needs review"

    body = (extracted_text or "").strip()
    if body and GEO_FOLDER_GATE_ENABLE:
        geo_conflict = geographic_folder_conflict(body, folder_name)
        if geo_conflict and structure_active:
            repaired = _structure_geo_repaired_folder(
                scored, uncertain_folder=uncertain_folder
            )
            if repaired and not geographic_folder_conflict(body, repaired):
                folder_name = repaired
                geo_conflict = None
                if _structure_trust_assembled_path(scored, folder_name, uncertain_folder):
                    confidence = max(float(confidence), 0.75)
        if geo_conflict:
            folder_name = uncertain_folder
            reason = geo_conflict
            allow_weak_evidence = False
            confidence = min(float(confidence), float(threshold))

    if (
        not structure_skipped_rerank
        and body
        and lc_f is not None
        and rs_f is not None
        and rs_f < RERANK_WEAK_FLOOR
        and (lc_f - rs_f) >= LLM_RERANK_GAP_UNCERTAIN
        and folder_name.lower() != uncertain_folder.lower()
        and not geo_supports_new_folder(body, folder_name)
        and not filename_supports_llm_escape(file_path)
        and not llm_trusts_existing_despite_weak_body
        and not (vision_backed and doc_kind)
        and llm_folder_name
        and folder_name.strip().lower() == llm_folder_name.strip().lower()
        and not rerank_llm_disagreed
    ):
        folder_name = uncertain_folder
        reason = "Model much more confident than text match; manual review required"
        allow_weak_evidence = False
        confidence = min(float(confidence), float(threshold))

    # Video: do not auto-file into generic */Videos storage buckets—require a topic-specific destination.
    ext = pathlib.Path(str(file_path or "")).suffix.lower()
    is_video_file = ext in VIDEO_FILE_EXTENSIONS
    src = (extraction_source or "").strip().lower()
    if (
        (src.startswith("video_") or is_video_file)
        and is_generic_media_destination(str(folder_name))
    ):
        folder_name = uncertain_folder
        reason = "Generic Videos folder not used; pick a subject-specific folder (or add one) for this video."
        allow_weak_evidence = False
        confidence = min(float(confidence), float(threshold))

    if structure_active and folder_name.strip().lower() == uncertain_folder.lower():
        prov = str(scored.get("structure_path_provisional") or "").strip()
        if (
            prov
            and prov.lower() != uncertain_folder.lower()
            and _structure_trust_assembled_path(scored, prov, uncertain_folder)
        ):
            folder_name = prov

    if structure_active and folder_name.strip().lower() == uncertain_folder.lower():
        confidence = min(float(confidence), STRUCTURE_UNCERTAIN_CONFIDENCE_CAP)
        reason = STRUCTURE_UNCERTAIN_REASON

    return AnalyzeGateResult(
        folder_name=normalize_rel_dest(str(folder_name)),
        confidence=float(confidence),
        reason=reason,
        allow_weak_evidence=allow_weak_evidence,
    )
