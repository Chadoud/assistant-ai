"""
Uses Ollama to classify a file's text content into a folder name with confidence.
If existing folder names are provided, the AI is asked to reuse one if appropriate.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from classifier_ollama import delete_model, list_models, pull_model, pull_model_stream
from classifier_prompts import (
    NARROW_TIE_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    TOP_K_JUDGE_SYSTEM_PROMPT,
    build_context_hint,
    compose_sort_system_prompt,
    default_job_language,
    excerpt_for_classification,
)
from classifier_scoring import (
    apply_llm_pick_boost,
    cap_candidates_preserve_llm_and_uncertain,
    effective_llm_agreement_boost,
    parse_scored_response,
    rank_existing_folders,
    rerank_candidate,
)
from constants import (
    CANDIDATE_MARGIN_THRESHOLD,
    DEFAULT_JOB_LANGUAGE,
    DEFAULT_OLLAMA_MODEL,
    EXTRACTION_LOW_QUALITY_FLOOR,
    EXTRACTION_UNCERTAIN_QUALITY,
    FILENAME_EMPHASIS_LLM_TRIGGER,
    FILENAME_EMPHASIS_STRENGTH,
    JUDGE_MARGIN_THRESHOLD,
    JUDGE_TOP_K,
    JUDGE_TOP_K_ENABLE,
    LLM_RERANK_GAP_UNCERTAIN,
    LLM_TRUST_FOR_WEAK_RERANK,
    MAX_CANDIDATES,
    MAX_TEXT_EXCERPT,
    OLLAMA_AUTO_NARROW_TIE,
    OLLAMA_CHAT_OPTIONS,
    OLLAMA_NARROW_MARGIN,
    RERANK_WEAK_FLOOR,
    SEMANTIC_RERANK,
    UNCERTAIN_FOLDER,
)
from destination_path import normalize_rel_dest
from llm.ollama_client import chat as _ollama_chat
from semantic_rerank import blend_with_semantic_scores
from sort_structure.assemble_classify import finalize_structure_classify
from sort_structure.assist import structure_geo_hint_line
from sort_structure.compile import (
    ClassifyContract,
    structure_system_appendix,
)

logger = logging.getLogger(__name__)


class _OllamaNamespace:
    """Patch point for tests: ``@patch(\"classifier.ollama.chat\")``."""

    @staticmethod
    def chat(**kwargs: Any) -> dict[str, Any]:
        return _ollama_chat(**kwargs)


ollama = _OllamaNamespace()

_excerpt_for_classification = excerpt_for_classification


def _lexical_top_margin(candidate_scores: list[dict]) -> float:
    """Difference between best and second-best rerank scores (before LLM agreement boost)."""
    if len(candidate_scores) < 2:
        return 1.0
    ranked = sorted(candidate_scores, key=lambda x: float(x.get("score", 0.0)), reverse=True)
    return float(ranked[0]["score"]) - float(ranked[1]["score"])


def _ollama_chat_message_content(model: str, system: str, user: str) -> str:
    """Single chat completion; uses ``classifier.ollama`` so tests can patch ``classifier.ollama.chat``."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    response = ollama.chat(
        model=model,
        messages=messages,
        options=OLLAMA_CHAT_OPTIONS,
    )
    return response["message"]["content"].strip()


def classify(
    text: str,
    existing_folders: list[str],
    folder_contexts: dict[str, dict] | None = None,
    model: str = DEFAULT_OLLAMA_MODEL,
    language: str = DEFAULT_JOB_LANGUAGE,
) -> str:
    """
    Returns a folder name string for the given file text.
    Will attempt to reuse an existing folder name when the content matches.
    """
    return classify_scored(
        text=text,
        existing_folders=existing_folders,
        folder_contexts=folder_contexts,
        model=model,
        language=language,
    )["folder_name"]


def canonical_existing_folder(name: str, existing_folders: list[str]) -> str | None:
    """Return the filesystem-cased folder name if `name` matches an entry case-insensitively."""
    n = (name or "").strip().lower()
    if not n:
        return None
    for f in existing_folders:
        if isinstance(f, str) and f.strip().lower() == n:
            return f.strip()
    return None


def _primary_classify_system_prompt(
    sort_system_prompt: str | None,
    structure_contract: ClassifyContract | None = None,
) -> str:
    base = compose_sort_system_prompt(sort_system_prompt)
    if structure_contract and structure_contract.levels:
        return base + structure_system_appendix(structure_contract)
    return base


def classify_scored(
    text: str,
    existing_folders: list[str],
    folder_contexts: dict[str, dict] | None = None,
    model: str = DEFAULT_OLLAMA_MODEL,
    language: str = DEFAULT_JOB_LANGUAGE,
    source_filename: str | None = None,
    document_hint: str | None = None,
    document_briefing: str | None = None,
    classification_language: str | None = None,
    sort_system_prompt: str | None = None,
    structure_contract: ClassifyContract | None = None,
    filename_tokens: list[str] | None = None,
    structured_vision: dict[str, Any] | None = None,
    extraction_confidence: float | None = None,
    extraction_quality: float | None = None,
    structure_sort: bool = False,
) -> dict[str, Any]:
    """
    Returns a structured classification result:
    { "folder_name": str, "confidence": float, "reason": str }.

    Folder names in the user prompt always follow ``language`` (job setting).
    ``classification_language`` is accepted for API compatibility but ignored here;
    use it only in document briefing, not for on-disk folder naming.
    When ``sort_system_prompt`` is set, it is appended to the built-in system prompt
    (the core classification rules and JSON contract cannot be replaced).
    """
    folders_hint = ""
    context_hint = ""
    structure_mode = bool(structure_contract and structure_contract.levels)
    if not structure_mode and existing_folders:
        folders_hint = (
            f"\nExisting folders: {', '.join(existing_folders)}\n"
            "Reuse one of these exact names when the content clearly belongs there. "
            "If none fit, output a NEW folder name that matches the document type "
            "(do not force a poor match just because a name exists)."
        )
    if not structure_mode:
        context_hint = build_context_hint(folder_contexts or {})
    excerpt = excerpt_for_classification(text, MAX_TEXT_EXCERPT)
    folder_names_language = default_job_language(language)
    fn_hint = ""
    _sf = (source_filename or "").strip()
    if _sf:
        fn_hint = f"Original file name: {_sf}\n"
    layout_hint = ""
    _dh = (document_hint or "").strip()
    if _dh:
        layout_hint = f"Layout-detected title or heading (hint only): {_dh}\n"
    briefing_block = ""
    _br = (document_briefing or "").strip()
    if _br:
        briefing_block = (
            "Filing briefing (condensed understanding of the document; use with the excerpt):\n"
            f"\"\"\"\n{_br[:2400]}\n\"\"\"\n"
        )
    geo_hint = structure_geo_hint_line(excerpt) if structure_mode else ""

    user_message = (
        f"{briefing_block}"
        f"{geo_hint}"
        f"File content (excerpt):\n\"\"\"\n{excerpt}\n\"\"\"\n"
        f"{layout_hint}"
        f"{fn_hint}"
        f"{folders_hint}\n"
        f"{context_hint}\n"
        f"Folder names must be in {folder_names_language}.\n"
    )
    if structure_mode:
        user_message += (
            "Reply in JSON only with theme_values, auto_tail, confidence, reason, primary_purpose.\n"
            "Do not pick from legacy flat folder names; extract themed path segments only.\n"
        )
    else:
        user_message += (
            "Reply in JSON only, e.g. "
            '{"folder_name":"Invoices","confidence":0.88,"reason":"Invoice totals",'
            '"primary_purpose":"vendor invoice for payment"} or '
            '{"folder_name":"Career/Job Applications","confidence":0.85,"reason":"CV and cover letter",'
            '"primary_purpose":"job application packet"}.'
        )

    system = _primary_classify_system_prompt(sort_system_prompt, structure_contract)
    raw = _ollama_chat_message_content(model, system, user_message)

    if structure_mode:
        from analyze_policy import parse_doc_kind_from_briefing

        doc_kind = parse_doc_kind_from_briefing(document_briefing)
        finalized = finalize_structure_classify(
            structure_contract,
            raw,
            existing_folders=existing_folders,
            text=excerpt,
            document_briefing=document_briefing,
            doc_kind=doc_kind,
            document_language=(classification_language or "").strip() or None,
            structured_vision=structured_vision,
            filename_tokens=filename_tokens,
            extraction_confidence=extraction_confidence,
            extraction_quality=extraction_quality,
            structure_sort=structure_mode,
        )
        if finalized.get("parse_failed"):
            parsed = {
                "folder_name": UNCERTAIN_FOLDER,
                "confidence": 0.3,
                "reason": "Structure extraction failed",
                "structure_parse_failed": True,
            }
            auto_tail = None
            assist_trace: dict[str, str] = {}
        else:
            llm_fields = finalized.get("llm_fields") if isinstance(finalized.get("llm_fields"), dict) else {}
            conf = float(llm_fields.get("confidence", 0.5))
            path = str(finalized.get("folder_name") or UNCERTAIN_FOLDER)
            if path.strip().lower() == UNCERTAIN_FOLDER.lower():
                conf = min(conf, 0.5)
            parsed = {
                "folder_name": path,
                "confidence": conf,
                "reason": str(llm_fields.get("reason", "")),
                "primary_purpose": llm_fields.get("primary_purpose"),
                "structure_values": finalized.get("structure_values") or {},
                "structure_path_provisional": finalized.get("structure_path_provisional"),
                "structure_parse_failed": False,
            }
            auto_tail = finalized.get("auto_tail")
            assist_trace = finalized.get("structure_assist") if isinstance(finalized.get("structure_assist"), dict) else {}
        parsed["llm_folder_name"] = str(parsed.get("folder_name", "") or "")
        parsed["classification_disagree"] = False
        parsed["decision_trace"] = {
            "structure_template": True,
            "structure_prompt_mode": "themes_only",
            "structure_parse_failed": bool(parsed.get("structure_parse_failed")),
            "structure_auto_tail": auto_tail,
            "structure_assist": assist_trace or None,
        }
        return parsed

    parsed = parse_scored_response(raw)
    parsed["llm_folder_name"] = str(parsed.get("folder_name", "") or "")
    parsed["classification_disagree"] = False
    return parsed


def _narrow_disambiguate(
    text: str,
    folder_a: str,
    folder_b: str,
    model: str,
    language: str,
    source_filename: str | None = None,
    primary_purpose: str | None = None,
) -> dict[str, Any] | None:
    """
    Second-pass prompt: choose only between two folder names (tie-break).
    Returns None on failure; caller must validate folder_name matches A or B.
    """
    allowed = {folder_a.strip(), folder_b.strip()}
    fn_line = ""
    _nsf = (source_filename or "").strip()
    if _nsf:
        fn_line = f"Original file name: {_nsf}\n"
    pp_line = ""
    _pp = (primary_purpose or "").strip()
    if _pp:
        pp_line = f"Prior primary_purpose from first pass: {_pp}\n"
    user_message = (
        "Pick exactly ONE folder for this file. Only these two options are allowed:\n"
        f'1) "{folder_a}"\n'
        f'2) "{folder_b}"\n'
        f"Folder names must be in {language}.\n"
        f'Reply in JSON only: {{"folder_name":"...","confidence":0.0-1.0,"reason":"..."}}\n'
        f'folder_name must be exactly "{folder_a}" or "{folder_b}".\n'
        f"{fn_line}"
        f"{pp_line}"
        f"File content (excerpt):\n\"\"\"\n{excerpt_for_classification(text, MAX_TEXT_EXCERPT)}\n\"\"\"\n"
    )
    try:
        raw = _ollama_chat_message_content(model, NARROW_TIE_SYSTEM_PROMPT, user_message)
        parsed = parse_scored_response(raw)
        name = str(parsed.get("folder_name", "")).strip()
        if not name:
            return None
        for opt in allowed:
            if name.lower() == opt.lower():
                return {
                    "folder_name": opt,
                    "confidence": float(parsed.get("confidence", 0.5)),
                    "reason": str(parsed.get("reason", ""))[:120],
                }
        return None
    except Exception as exc:
        logger.warning("narrow_tie_break LLM call failed: %s", exc)
        return None


def _top_k_judge(
    text: str,
    options: list[str],
    model: str,
    language: str,
    *,
    document_briefing: str | None = None,
    source_filename: str | None = None,
    primary_purpose: str | None = None,
) -> dict[str, Any] | None:
    """
    LLM picks exactly one folder from the allowed list (general tie-break, not keyword rules).
    """
    allowed = [o.strip() for o in options if o.strip()][:JUDGE_TOP_K]
    if len(allowed) < 2:
        return None
    allowed_set = {a.lower(): a for a in allowed}
    lines = "\n".join(f'{i + 1}) "{name}"' for i, name in enumerate(allowed))
    fn_line = ""
    if (source_filename or "").strip():
        fn_line = f"Original file name: {source_filename.strip()}\n"
    pp_line = ""
    if (primary_purpose or "").strip():
        pp_line = f"Prior primary_purpose: {str(primary_purpose).strip()[:200]}\n"
    br_line = ""
    if (document_briefing or "").strip():
        br_line = (
            "Filing briefing:\n\"\"\"\n"
            f"{str(document_briefing).strip()[:2000]}\n\"\"\"\n"
        )
    user_message = (
        "Pick exactly ONE destination folder for this file. "
        "Only the following options are allowed (verbatim spelling):\n"
        f"{lines}\n"
        f"Folder names must use the same language style as: {language}.\n"
        f"{fn_line}{pp_line}{br_line}"
        f"File content (excerpt):\n\"\"\"\n{excerpt_for_classification(text, MAX_TEXT_EXCERPT)}\n\"\"\"\n"
        'Reply in JSON only: {"folder_name":"...","confidence":0.0-1.0,"reason":"..."}\n'
        "folder_name must be exactly one of the listed options, character-for-character "
        "(aside from matching case-insensitively).\n"
    )
    try:
        raw = _ollama_chat_message_content(model, TOP_K_JUDGE_SYSTEM_PROMPT, user_message)
        parsed = parse_scored_response(raw)
        name = str(parsed.get("folder_name", "")).strip()
        if not name:
            return None
        key = name.lower()
        if key in allowed_set:
            return {
                "folder_name": allowed_set[key],
                "confidence": float(parsed.get("confidence", 0.55)),
                "reason": str(parsed.get("reason", ""))[:160],
            }
        for opt in allowed:
            if name.lower() == opt.lower():
                return {
                    "folder_name": opt,
                    "confidence": float(parsed.get("confidence", 0.55)),
                    "reason": str(parsed.get("reason", ""))[:160],
                }
        return None
    except Exception as exc:
        logger.warning("top_k_judge LLM call failed: %s", exc)
        return None


def _structure_classify_candidates_result(
    base: dict[str, Any],
    *,
    job_language: str,
    classification_language: str | None,
    primary_purpose_str: str | None,
) -> dict[str, Any]:
    """Trust assembled structure path; skip flat-folder rerank that can override themes."""
    llm_pick_sanitized = normalize_rel_dest(str(base.get("folder_name", "")))
    llm_conf = float(max(0.0, min(1.0, float(base.get("confidence", 0.5)))))
    folder_out = llm_pick_sanitized
    candidate_scores: list[dict[str, Any]] = [{"folder_name": folder_out, "score": llm_conf}]
    if folder_out.strip().lower() != UNCERTAIN_FOLDER.lower():
        candidate_scores.append({"folder_name": UNCERTAIN_FOLDER, "score": 0.0})
    margin = llm_conf if len(candidate_scores) < 2 else llm_conf - float(candidate_scores[1]["score"])

    decision_trace: dict[str, Any] = {}
    if isinstance(base.get("decision_trace"), dict):
        decision_trace.update(base["decision_trace"])
    decision_trace["structure_rerank_skipped"] = True
    decision_trace["folder_names_language"] = job_language
    detected = (classification_language or "").strip() or None
    if detected:
        decision_trace["detected_language"] = detected

    result: dict[str, Any] = {
        "folder_name": folder_out,
        "confidence": llm_conf,
        "reason": str(base.get("reason", "")),
        "primary_purpose": primary_purpose_str,
        "candidate_scores": candidate_scores,
        "decision_reason": f"structure_path={folder_out}; rerank_skipped=1",
        "llm_confidence": llm_conf,
        "rerank_top_score": llm_conf,
        "candidate_margin": margin,
        "classification_disagree": False,
        "llm_folder_name": llm_pick_sanitized,
        "decision_trace": decision_trace,
    }
    for key in ("structure_values", "structure_path_provisional"):
        if key in base:
            result[key] = base[key]
    return result


def classify_candidates(
    text: str,
    existing_folders: list[str],
    folder_contexts: dict[str, dict] | None = None,
    model: str = DEFAULT_OLLAMA_MODEL,
    language: str = DEFAULT_JOB_LANGUAGE,
    filename_tokens: list[str] | None = None,
    max_candidates: int = MAX_CANDIDATES,
    extraction_quality: float | None = None,
    source_filename: str | None = None,
    document_hint: str | None = None,
    document_briefing: str | None = None,
    classification_language: str | None = None,
    sort_system_prompt: str | None = None,
    structure_contract: ClassifyContract | None = None,
    structured_vision: dict[str, Any] | None = None,
    extraction_confidence: float | None = None,
) -> dict[str, Any]:
    """
    Return candidate folder scores and decision explanation.

    ``classification_language`` (e.g. detected document language) is optional metadata
    recorded in ``decision_trace`` only; folder naming always uses ``language``.
    """
    filename_tokens = [t for t in (filename_tokens or []) if isinstance(t, str) and t.strip()]
    folder_contexts = folder_contexts or {}
    job_language = default_job_language(language)
    base = classify_scored(
        text,
        existing_folders,
        folder_contexts,
        model,
        language,
        source_filename=source_filename,
        document_hint=document_hint,
        document_briefing=document_briefing,
        sort_system_prompt=sort_system_prompt,
        structure_contract=structure_contract,
        filename_tokens=filename_tokens,
        structured_vision=structured_vision,
        extraction_confidence=extraction_confidence,
        extraction_quality=extraction_quality,
        structure_sort=bool(structure_contract and structure_contract.levels),
    )
    _pp0 = base.get("primary_purpose")
    primary_purpose_str: str | None = (
        str(_pp0).strip()[:200] if isinstance(_pp0, str) and _pp0.strip() else None
    )

    if structure_contract and structure_contract.levels:
        return _structure_classify_candidates_result(
            base,
            job_language=job_language,
            classification_language=classification_language,
            primary_purpose_str=primary_purpose_str,
        )

    llm_conf_pre = float(max(0.0, min(1.0, float(base.get("confidence", 0.5)))))

    def initial_filename_emphasis() -> float:
        if not filename_tokens:
            return 0.0
        if llm_conf_pre < float(FILENAME_EMPHASIS_LLM_TRIGGER):
            return float(FILENAME_EMPHASIS_STRENGTH)
        if extraction_quality is not None and float(extraction_quality) < float(EXTRACTION_UNCERTAIN_QUALITY):
            return float(FILENAME_EMPHASIS_STRENGTH)
        return 0.0

    def build_candidate_scores(filename_emphasis: float) -> list[dict]:
        candidates_local: list[str] = []
        if base["folder_name"]:
            candidates_local.append(base["folder_name"])
        ranked = rank_existing_folders(
            text,
            existing_folders,
            folder_contexts,
            filename_tokens,
            filename_emphasis=filename_emphasis,
        )
        for name, _score in ranked:
            if name not in candidates_local:
                candidates_local.append(name)
            if len(candidates_local) >= max_candidates:
                break
        if UNCERTAIN_FOLDER not in candidates_local:
            candidates_local.append(UNCERTAIN_FOLDER)
        capped = cap_candidates_preserve_llm_and_uncertain(
            candidates_local, max_candidates, str(base.get("folder_name", ""))
        )
        scores: list[dict] = []
        for cand in capped[:max_candidates]:
            scores.append(
                {
                    "folder_name": cand,
                    "score": rerank_candidate(
                        cand,
                        text,
                        folder_contexts.get(cand, {}),
                        filename_tokens,
                        filename_emphasis=filename_emphasis,
                    ),
                }
            )
        return scores

    filename_emphasis = initial_filename_emphasis()
    candidate_scores = build_candidate_scores(filename_emphasis)
    if (
        filename_tokens
        and filename_emphasis <= 0
        and _lexical_top_margin(candidate_scores) < float(CANDIDATE_MARGIN_THRESHOLD)
    ):
        filename_emphasis = float(FILENAME_EMPHASIS_STRENGTH)
        candidate_scores = build_candidate_scores(filename_emphasis)

    candidate_scores = apply_llm_pick_boost(
        candidate_scores,
        str(base.get("folder_name", "")),
        effective_llm_agreement_boost(extraction_quality),
    )
    candidate_scores.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)

    semantic_applied = False
    if SEMANTIC_RERANK and candidate_scores:
        blended, semantic_applied = blend_with_semantic_scores(
            candidate_scores,
            query_text=text,
            primary_purpose=primary_purpose_str,
            folder_contexts=folder_contexts,
            document_briefing=document_briefing,
        )
        if semantic_applied:
            candidate_scores = blended
            candidate_scores.sort(key=lambda x: float(x.get("score", 0.0)), reverse=True)
    top = candidate_scores[0] if candidate_scores else {"folder_name": base["folder_name"], "score": base["confidence"]}
    second = candidate_scores[1] if len(candidate_scores) > 1 else {"folder_name": UNCERTAIN_FOLDER, "score": 0.0}
    margin = float(top["score"]) - float(second["score"])
    decision_reason = (
        f"Top={top['folder_name']} score={float(top['score']):.2f}; "
        f"second={second['folder_name']} score={float(second['score']):.2f}; margin={margin:.2f}"
    )
    if primary_purpose_str:
        decision_reason += f"; primary_purpose={primary_purpose_str[:80]}"
    if semantic_applied:
        decision_reason += "; semantic_rerank=1"

    folder_out = str(top["folder_name"])
    reason_out = base.get("reason", "")
    llm_pick_sanitized = normalize_rel_dest(str(base.get("folder_name", "")))
    llm_conf = float(max(0.0, min(1.0, float(base.get("confidence", 0.5)))))
    rerank_conf = float(max(0.0, min(1.0, float(top["score"]))))
    conf_out = llm_conf if folder_out.strip().lower() == llm_pick_sanitized.strip().lower() else rerank_conf
    if (
        folder_out.strip().lower() == llm_pick_sanitized.strip().lower()
        and rerank_conf < float(RERANK_WEAK_FLOOR)
        and (llm_conf - rerank_conf) >= float(LLM_RERANK_GAP_UNCERTAIN)
    ):
        conf_out = min(conf_out, rerank_conf + 0.12, 0.55)

    judge_used = False
    if (
        JUDGE_TOP_K_ENABLE
        and margin < float(JUDGE_MARGIN_THRESHOLD)
        and len(candidate_scores) >= 3
        and str(top["folder_name"]).lower() != UNCERTAIN_FOLDER.lower()
    ):
        top_names = [str(x.get("folder_name", "")) for x in candidate_scores[:JUDGE_TOP_K]]
        top_names = [n for n in top_names if n.strip() and n.lower() != UNCERTAIN_FOLDER.lower()][:JUDGE_TOP_K]
        if len(top_names) >= 2:
            ju = _top_k_judge(
                text,
                top_names,
                model,
                job_language,
                document_briefing=document_briefing,
                source_filename=source_filename,
                primary_purpose=primary_purpose_str,
            )
            if ju and ju.get("folder_name"):
                judge_used = True
                chosen = str(ju["folder_name"])
                folder_out = chosen
                conf_out = float(max(0.0, min(1.0, float(ju.get("confidence", conf_out)))))
                reason_out = str(ju.get("reason", reason_out))[:160]
                boost = max(float(top["score"]), 0.33) + 0.08
                new_scores: list[dict] = []
                seen_chosen = False
                for row in candidate_scores:
                    name = str(row.get("folder_name", ""))
                    sc = float(row.get("score", 0.0))
                    if name.lower() == chosen.lower():
                        new_scores.append({"folder_name": chosen, "score": min(1.0, boost)})
                        seen_chosen = True
                    else:
                        new_scores.append({"folder_name": name, "score": sc})
                if not seen_chosen:
                    new_scores.insert(0, {"folder_name": chosen, "score": min(1.0, boost)})
                candidate_scores = sorted(new_scores, key=lambda x: float(x.get("score", 0.0)), reverse=True)
                top = candidate_scores[0]
                second = candidate_scores[1] if len(candidate_scores) > 1 else {"folder_name": UNCERTAIN_FOLDER, "score": 0.0}
                margin = float(top["score"]) - float(second["score"])
                rerank_conf = float(max(0.0, min(1.0, float(top["score"]))))
                decision_reason += f"; top_k_judge={chosen}"

    narrow_on = os.environ.get("OLLAMA_NARROW_TIE_BREAK", "").lower() in ("1", "true", "yes")
    _nm_raw = os.environ.get("OLLAMA_NARROW_MARGIN")
    if _nm_raw is not None and str(_nm_raw).strip() != "":
        try:
            narrow_margin = float(_nm_raw)
        except ValueError:
            narrow_margin = float(OLLAMA_NARROW_MARGIN)
    else:
        narrow_margin = float(OLLAMA_NARROW_MARGIN)
    narrow_tie_used = False

    def _top_segment(folder: str) -> str:
        """Return the first path segment in lower-case (e.g. 'finance' from 'Finance/CV')."""
        return (folder or "").strip().lower().split("/")[0]

    # Fire the narrow tie-break when LLM and reranker disagree across *different* life domains
    # and the LLM is highly confident — even when the rerank margin is above the normal threshold.
    # This catches cases like a CV with finance-degree text: reranker scores Finance, LLM says Career.
    pre_narrow_disagree = folder_out.strip().lower() != llm_pick_sanitized.strip().lower()
    disagree_cross_domain = (
        pre_narrow_disagree
        and llm_conf >= float(LLM_TRUST_FOR_WEAK_RERANK)
        and bool(llm_pick_sanitized)
        and llm_pick_sanitized.strip().lower() != UNCERTAIN_FOLDER.lower()
        and folder_out.strip().lower() != UNCERTAIN_FOLDER.lower()
        and _top_segment(llm_pick_sanitized) != _top_segment(folder_out)
    )

    use_narrow = ((narrow_on or OLLAMA_AUTO_NARROW_TIE) and margin < narrow_margin) or disagree_cross_domain
    top_rerank = float(top["score"])
    skip_narrow_weak_signal = (
        top_rerank < float(RERANK_WEAK_FLOOR)
        and extraction_quality is not None
        and float(extraction_quality) < float(EXTRACTION_LOW_QUALITY_FLOOR)
    )
    if (
        use_narrow
        and not skip_narrow_weak_signal
        and len(candidate_scores) >= 2
        and str(top["folder_name"]).lower() != UNCERTAIN_FOLDER.lower()
    ):
        # For disagree_cross_domain the meaningful contest is LLM folder vs reranker folder,
        # not necessarily top-1 vs top-2 (which may both differ from the LLM pick).
        if disagree_cross_domain and str(second["folder_name"]).lower() == UNCERTAIN_FOLDER.lower():
            narrow_b = llm_pick_sanitized
        elif disagree_cross_domain:
            narrow_b = llm_pick_sanitized
        else:
            narrow_b = str(second["folder_name"])
        narrow_a = str(top["folder_name"])
        if narrow_b and narrow_b.lower() != narrow_a.lower() and narrow_b.lower() != UNCERTAIN_FOLDER.lower():
            nu = _narrow_disambiguate(
                text,
                narrow_a,
                narrow_b,
                model,
                job_language,
                source_filename=source_filename,
                primary_purpose=primary_purpose_str,
            )
            if nu and nu.get("folder_name"):
                narrow_tie_used = True
                folder_out = str(nu["folder_name"])
                conf_out = float(max(0.0, min(1.0, float(nu.get("confidence", conf_out)))))
                reason_out = str(nu.get("reason", reason_out))[:120]
                decision_reason += f"; narrow_tie_break={folder_out}"
                if disagree_cross_domain:
                    decision_reason += "(disagree_cross_domain)"

    classification_disagree = folder_out.strip().lower() != llm_pick_sanitized.strip().lower()

    if (
        classification_disagree
        and rerank_conf < RERANK_WEAK_FLOOR
        and llm_conf >= LLM_TRUST_FOR_WEAK_RERANK
    ):
        canon = canonical_existing_folder(llm_pick_sanitized, existing_folders)
        if canon:
            folder_out = canon
            conf_out = llm_conf
            classification_disagree = False
        elif llm_pick_sanitized and llm_pick_sanitized.strip().lower() != UNCERTAIN_FOLDER.lower():
            folder_out = llm_pick_sanitized
            conf_out = llm_conf
            classification_disagree = False

    detected = (classification_language or "").strip() or None
    decision_trace: dict[str, Any] = {
        "narrow_tie_break": narrow_tie_used,
        "semantic_rerank_applied": semantic_applied,
        "top_k_judge": judge_used,
        "folder_names_language": job_language,
        "detected_language": detected,
        "narrow_skipped_weak_signal": bool(skip_narrow_weak_signal),
        "filename_emphasis": float(filename_emphasis) if filename_emphasis > 0 else None,
    }

    return {
        "folder_name": folder_out,
        "confidence": conf_out,
        "reason": reason_out,
        "primary_purpose": primary_purpose_str,
        "candidate_scores": candidate_scores,
        "decision_reason": decision_reason,
        "llm_confidence": llm_conf,
        "rerank_top_score": float(top["score"]),
        "candidate_margin": float(margin),
        "classification_disagree": classification_disagree,
        "llm_folder_name": llm_pick_sanitized,
        "decision_trace": decision_trace,
    }


__all__ = [
    "classify",
    "classify_scored",
    "classify_candidates",
    "canonical_existing_folder",
    "rerank_candidate",
    "list_models",
    "delete_model",
    "pull_model",
    "pull_model_stream",
    "SYSTEM_PROMPT",
]
