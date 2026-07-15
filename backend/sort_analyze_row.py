"""
Shared per-file sort analyze pipeline (extract → briefing → classify → gates → rules).

Used by local JobService and VPS sort-worker so behavior stays identical.
"""

from __future__ import annotations

import dataclasses
import inspect
import logging
import os
import pathlib
import time
from typing import Any, Callable

from analyze_policy import apply_analyze_gates, parse_doc_kind_from_briefing
from classify_audit import build_classify_audit
from constants import DEFAULT_JOB_LANGUAGE, EXTRACTION_EXCERPT_MAX_CHARS, VIDEO_DEBUG_LOG
from destination_path import normalize_rel_dest
from document_briefing import brief_document_for_filing
from job_service_ndjson import append_classify_debug_ndjson
from language_detect import detect_document_language
from rules import first_matching_rule
from user_facing_errors import sanitize_user_facing_error

logger = logging.getLogger(__name__)

ExtractContentFn = Callable[..., dict[str, Any]]
ClassifyFn = Callable[..., dict[str, Any]]


def _best_calendar_folder(existing_folders: list[str]) -> str | None:
    """Return the first existing folder whose name suggests calendar/event content."""
    keywords = {"calendar", "events", "agenda", "meetings", "appointments"}
    for folder in existing_folders:
        if any(kw in folder.lower() for kw in keywords):
            return folder
    return None


@dataclasses.dataclass
class SortAnalyzeParams:
    file_path: str
    cfg: dict[str, Any]
    existing_folders: list[str]
    existing_folders_lower: set[str]
    folder_contexts: Any
    threshold: float
    uncertain_folder: str
    vision_vm: str | None
    ocr_lang: str | None
    ocr_langs: list[str] | None
    ocr_auto: bool
    structure_contract: Any
    extract_content: ExtractContentFn
    classify_fn: ClassifyFn
    source_filename: str | None = None
    gmail_staged_part: str | None = None
    job_id: str | None = None


@dataclasses.dataclass
class SortAnalyzeResult:
    ok: bool
    error: str | None = None
    size_bytes: int = 0
    analysis_excerpt: str = ""
    extraction_source: str = "unknown"
    extraction_quality: float = 0.0
    extraction_signals: dict[str, Any] = dataclasses.field(default_factory=dict)
    detected_language: str | None = None
    document_briefing: str | None = None
    doc_kind: str | None = None
    llm_reason: str | None = None
    structure_values: dict[str, str] | None = None
    structure_path_provisional: str | None = None
    candidate_scores: list[Any] = dataclasses.field(default_factory=list)
    decision_reason: str = ""
    llm_confidence: float | None = None
    rerank_top_score: float | None = None
    llm_folder_name: str | None = None
    classification_disagree: bool = False
    primary_purpose: str | None = None
    decision_trace: dict[str, Any] = dataclasses.field(default_factory=dict)
    suggested_folder: str = ""
    final_folder: str = ""
    confidence: float = 0.0
    reason: str = ""
    rule_applied_id: str | None = None
    approved: bool = True
    status: str = "review_ready"
    new_folder_name: str | None = None
    analyze_extract_ms: float | None = None
    analyze_briefing_ms: float = 0.0
    analyze_classify_ms: float | None = None
    want_briefing: bool = False
    skip_plain_briefing: bool = False

    def as_file_row_patch(self) -> dict[str, Any]:
        """Fields to merge onto a job file row."""
        patch: dict[str, Any] = {
            "size_bytes": self.size_bytes,
            "analysis_excerpt": self.analysis_excerpt,
            "extraction_source": self.extraction_source,
            "extraction_quality": self.extraction_quality,
            "extraction_signals": self.extraction_signals,
            "detected_language": self.detected_language,
            "document_briefing": self.document_briefing,
            "doc_kind": self.doc_kind,
            "llm_reason": self.llm_reason,
            "candidate_scores": self.candidate_scores,
            "decision_reason": self.decision_reason,
            "llm_confidence": self.llm_confidence,
            "rerank_top_score": self.rerank_top_score,
            "llm_folder_name": self.llm_folder_name,
            "classification_disagree": self.classification_disagree,
            "primary_purpose": self.primary_purpose,
            "decision_trace": self.decision_trace,
            "suggested_folder": self.suggested_folder,
            "final_folder": self.final_folder,
            "confidence": self.confidence,
            "reason": self.reason,
            "rule_applied_id": self.rule_applied_id,
            "approved": self.approved,
            "status": self.status,
            "error": self.error,
            "analyze_extract_ms": self.analyze_extract_ms,
            "analyze_briefing_ms": self.analyze_briefing_ms,
            "analyze_classify_ms": self.analyze_classify_ms,
        }
        if self.structure_values is not None:
            patch["structure_values"] = self.structure_values
        if self.structure_path_provisional:
            patch["structure_path_provisional"] = self.structure_path_provisional
        return patch


def run_sort_analyze_for_path(params: SortAnalyzeParams) -> SortAnalyzeResult:
    """Run extract + classify + gates for one file path (sync — call via ``asyncio.to_thread``)."""
    from job_service.analyze_support import (
        effective_document_briefing_enabled,
        should_skip_briefing_for_small_plaintext,
        should_skip_briefing_for_untrusted_extract,
    )

    file_path = params.file_path
    cfg = params.cfg
    existing_folders = params.existing_folders
    existing_folders_lower = params.existing_folders_lower
    thr = params.threshold
    uncertain = params.uncertain_folder

    try:
        try:
            size_bytes = int(os.path.getsize(file_path))
        except OSError:
            size_bytes = 0

        t_extract_start = time.perf_counter()
        structure_sort = bool(
            params.structure_contract and getattr(params.structure_contract, "levels", None)
        )
        extract_kwargs: dict[str, Any] = {}
        try:
            if structure_sort and "structure_sort" in inspect.signature(params.extract_content).parameters:
                extract_kwargs["structure_sort"] = True
        except (TypeError, ValueError):
            pass
        payload = params.extract_content(
            file_path,
            params.vision_vm,
            params.ocr_lang,
            params.ocr_langs,
            params.ocr_auto,
            **extract_kwargs,
        )
        text = str(payload.get("text", "") or "")
        extraction_source = str(payload.get("extraction_source", "unknown"))
        quality_score = float(payload.get("quality_score", 0.0))
        signals = payload.get("signals", {}) if isinstance(payload.get("signals"), dict) else {}
        structured_vision = (
            signals.get("structured_vision")
            if isinstance(signals.get("structured_vision"), dict)
            else None
        )
        extraction_confidence = signals.get("extraction_confidence")
        try:
            extraction_confidence_f = (
                float(extraction_confidence) if extraction_confidence is not None else quality_score
            )
        except (TypeError, ValueError):
            extraction_confidence_f = quality_score
        low_signal = text.startswith("LOW_SIGNAL_FALLBACK")
        extract_ms = (time.perf_counter() - t_extract_start) * 1000.0

        filename_tokens: list[str] = []
        if isinstance(signals.get("filename_tokens"), list):
            filename_tokens = [str(t) for t in signals["filename_tokens"]]
        doc_hint: str | None = None
        if isinstance(signals.get("document_hint"), str) and signals["document_hint"].strip():
            doc_hint = signals["document_hint"].strip()

        src_name = (params.source_filename or "").strip()
        if not src_name:
            src_name = pathlib.Path(file_path).name

        job_lang = cfg.get("language")
        if not isinstance(job_lang, str) or not job_lang.strip():
            job_lang = DEFAULT_JOB_LANGUAGE
        detected_lang = detect_document_language(text, fallback=job_lang.strip())

        # Fast path: calendar files are fully deterministic — skip briefing and classify.
        if extraction_source == "calendar_ics" and not structure_sort:
            calendar_folder = _best_calendar_folder(existing_folders) or "Events"
            return SortAnalyzeResult(
                ok=True,
                size_bytes=size_bytes,
                analysis_excerpt=text[:EXTRACTION_EXCERPT_MAX_CHARS],
                extraction_source=extraction_source,
                extraction_quality=quality_score,
                extraction_signals=signals,
                detected_language=detected_lang,
                suggested_folder=calendar_folder,
                final_folder=calendar_folder,
                confidence=0.95,
                reason="Calendar file (iCalendar format)",
                approved=True,
                status="review_ready",
                analyze_extract_ms=extract_ms,
            )

        # Fast path: target_folder rules are resolved before any LLM call.
        # Skip rules applies to non-structure sorts only; skip rules let LLM propose the folder.
        # Structure sorts depend on classify filling structure_values — no early exit there.
        if not structure_sort:
            early_match = first_matching_rule(file_path, cfg.get("rules") or [])
            if early_match and not early_match.skip and early_match.folder:
                rule_folder = normalize_rel_dest(str(early_match.folder))
                return SortAnalyzeResult(
                    ok=True,
                    size_bytes=size_bytes,
                    analysis_excerpt=text[:EXTRACTION_EXCERPT_MAX_CHARS],
                    extraction_source=extraction_source,
                    extraction_quality=quality_score,
                    extraction_signals=signals,
                    detected_language=detected_lang,
                    suggested_folder=rule_folder,
                    final_folder=rule_folder,
                    confidence=0.95,
                    reason=f"Sorting rule \u2192 {rule_folder} ({early_match.rule_id})",
                    rule_applied_id=early_match.rule_id,
                    approved=True,
                    status="review_ready",
                    analyze_extract_ms=extract_ms,
                )

        want_briefing = effective_document_briefing_enabled(cfg, extraction_source=extraction_source)
        skip_plain = should_skip_briefing_for_small_plaintext(
            text=text,
            extraction_source=extraction_source,
            quality_score=quality_score,
            low_signal=low_signal,
            gmail_staged_part=params.gmail_staged_part,
        )
        skip_untrusted = should_skip_briefing_for_untrusted_extract(
            text=text,
            extraction_source=extraction_source,
            quality_score=quality_score,
            low_signal=low_signal,
        )
        briefing_ms = 0.0
        briefing: str | None = None
        if want_briefing and not skip_plain and not skip_untrusted:
            t_brief = time.perf_counter()
            briefing = brief_document_for_filing(
                text,
                model=cfg["model"],
                document_hint=doc_hint,
                source_filename=src_name or None,
                classification_language=detected_lang,
            )
            briefing_ms = (time.perf_counter() - t_brief) * 1000.0
        document_briefing = briefing[:900] if isinstance(briefing, str) and briefing.strip() else None
        doc_kind = parse_doc_kind_from_briefing(document_briefing)

        sort_prompt = cfg.get("sort_system_prompt")
        if not isinstance(sort_prompt, str) or not sort_prompt.strip():
            sort_prompt = None
        else:
            sort_prompt = sort_prompt.strip()

        t_classify_start = time.perf_counter()
        scored = params.classify_fn(
            text,
            existing_folders,
            params.folder_contexts,
            cfg["model"],
            job_lang.strip(),
            filename_tokens,
            extraction_quality=quality_score,
            extraction_confidence=extraction_confidence_f,
            source_filename=src_name or None,
            document_hint=doc_hint,
            document_briefing=briefing,
            classification_language=detected_lang,
            sort_system_prompt=sort_prompt,
            structure_contract=params.structure_contract,
            structured_vision=structured_vision,
        )
        llm_reason = str(scored.get("reason", "") or "").strip()[:240]

        structure_values = None
        sv = scored.get("structure_values")
        if isinstance(sv, dict):
            structure_values = {str(k): str(v) for k, v in sv.items()}
        structure_path_provisional = None
        prov = scored.get("structure_path_provisional")
        if isinstance(prov, str) and prov.strip():
            structure_path_provisional = prov.strip()

        candidate_scores = (
            scored.get("candidate_scores", []) if isinstance(scored.get("candidate_scores"), list) else []
        )
        lc = scored.get("llm_confidence")
        rs = scored.get("rerank_top_score")
        llm_confidence = float(lc) if lc is not None else None
        rerank_top_score = float(rs) if rs is not None else None
        lfm = scored.get("llm_folder_name")
        llm_folder_name = str(lfm).strip() if isinstance(lfm, str) and lfm.strip() else None
        pp = scored.get("primary_purpose")
        primary_purpose = str(pp).strip() if isinstance(pp, str) and pp.strip() else None

        gate = apply_analyze_gates(
            scored=scored,
            file_path=file_path,
            quality_score=quality_score,
            low_signal=low_signal,
            existing_folders=existing_folders,
            existing_folders_lower=existing_folders_lower,
            threshold=thr,
            uncertain_folder=uncertain,
            extraction_source=extraction_source,
            extracted_text=text,
            doc_kind=doc_kind,
        )
        folder_name = gate.folder_name
        confidence = gate.confidence
        reason = gate.reason

        if VIDEO_DEBUG_LOG and extraction_source.startswith("video_"):
            logger.info(
                "video_debug event=gating_result file=%r extraction_source=%r quality=%.4f folder=%r",
                pathlib.Path(file_path).name,
                extraction_source,
                quality_score,
                folder_name,
            )

        decision_trace: dict[str, Any] = {"v": 1}
        if isinstance(scored.get("decision_trace"), dict):
            decision_trace.update(scored["decision_trace"])
        decision_trace["classify_audit"] = build_classify_audit(
            text=text,
            folder_name=str(scored.get("folder_name", "")),
            llm_folder_name=llm_folder_name,
            llm_confidence=llm_confidence,
            rerank_top_score=rerank_top_score,
            folder_contexts=params.folder_contexts,
            detected_language=detected_lang,
            document_briefing=document_briefing,
            briefing_wanted=want_briefing,
            briefing_skipped_plain=skip_plain,
            primary_purpose=primary_purpose,
        )

        if params.job_id:
            append_classify_debug_ndjson(
                job_id=params.job_id,
                file_path=file_path,
                payload={
                    "extraction_source": extraction_source,
                    "extraction_quality": quality_score,
                    "folder_after_classify": str(scored.get("folder_name", "")),
                    "after_gates": folder_name,
                    "confidence": confidence,
                    "reason": reason,
                    "decision_reason": str(scored.get("decision_reason", "")),
                    "primary_purpose": primary_purpose,
                    "candidate_margin": scored.get("candidate_margin"),
                    "top_candidate_scores": candidate_scores[:5],
                    "decision_trace": decision_trace,
                    "llm_reason": llm_reason,
                    "detected_language": detected_lang,
                    "document_briefing": document_briefing,
                },
            )

        rule_applied_id: str | None = None
        match = first_matching_rule(file_path, cfg.get("rules") or [])
        if match:
            rule_applied_id = match.rule_id
            if match.skip:
                folder_name = uncertain
                reason = f"Sorting rule: skip (manual review) ({rule_applied_id})"
            elif match.folder and str(match.folder).strip():
                folder_name = normalize_rel_dest(str(match.folder).strip())
                reason = f"Sorting rule → {folder_name} ({rule_applied_id})"
                confidence = max(float(confidence), float(thr), 0.95)

        classify_ms = (time.perf_counter() - t_classify_start) * 1000.0
        new_folder: str | None = None
        if folder_name != uncertain and folder_name not in existing_folders:
            new_folder = folder_name

        is_uncertain = folder_name.strip().lower() == uncertain.strip().lower()

        return SortAnalyzeResult(
            ok=True,
            size_bytes=size_bytes,
            analysis_excerpt=text[:EXTRACTION_EXCERPT_MAX_CHARS],
            extraction_source=extraction_source,
            extraction_quality=quality_score,
            extraction_signals=signals,
            detected_language=detected_lang,
            document_briefing=document_briefing,
            doc_kind=doc_kind,
            llm_reason=llm_reason or None,
            structure_values=structure_values,
            structure_path_provisional=structure_path_provisional,
            candidate_scores=candidate_scores,
            decision_reason=str(scored.get("decision_reason", "")),
            llm_confidence=llm_confidence,
            rerank_top_score=rerank_top_score,
            llm_folder_name=llm_folder_name,
            classification_disagree=bool(scored.get("classification_disagree")),
            primary_purpose=primary_purpose,
            decision_trace=decision_trace,
            suggested_folder=folder_name,
            final_folder=folder_name,
            confidence=confidence,
            reason=reason,
            rule_applied_id=rule_applied_id,
            approved=not is_uncertain,
            status="review_ready",
            error=None,
            new_folder_name=new_folder,
            analyze_extract_ms=round(extract_ms, 1),
            analyze_briefing_ms=round(briefing_ms, 1),
            analyze_classify_ms=round(classify_ms, 1),
            want_briefing=want_briefing,
            skip_plain_briefing=skip_plain,
        )
    except Exception as exc:
        return SortAnalyzeResult(
            ok=False,
            error=sanitize_user_facing_error(str(exc)),
            status="error",
            approved=False,
        )
