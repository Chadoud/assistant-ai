"""Parse LLM JSON replies and score candidate folders (lexical overlap, caps, boosts)."""

from __future__ import annotations

import json
import re
from typing import Any

from classify_audit import geo_rerank_adjustment
from constants import (
    LLM_AGREEMENT_BOOST_FULL_QUALITY,
    LLM_AGREEMENT_BOOST_MIN_QUALITY,
    LLM_CANDIDATE_AGREEMENT_BOOST,
    UNCERTAIN_FOLDER,
)
from destination_path import normalize_rel_dest


def cap_candidates_preserve_llm_and_uncertain(
    candidates: list[str],
    max_n: int,
    llm_folder_raw: str,
) -> list[str]:
    """When trimming to max_n, keep the LLM pick and Uncertain in the scored set when possible."""
    if max_n < 1:
        return []
    if len(candidates) <= max_n:
        return candidates
    llm = normalize_rel_dest(str(llm_folder_raw)).strip() if llm_folder_raw else ""
    u = UNCERTAIN_FOLDER
    dedup: list[str] = []
    seen: set[str] = set()
    for c in candidates:
        k = c.strip().lower()
        if k in seen:
            continue
        seen.add(k)
        dedup.append(c.strip())

    must_llm = [llm] if llm and llm.lower() != u.lower() else []
    middle = [
        x
        for x in dedup
        if x.lower() != u.lower() and (not llm or x.lower() != llm.lower())
    ]
    budget_mid = max_n - len(must_llm) - 1
    mid_trim = middle[: max(0, budget_mid)]
    out = must_llm + mid_trim
    if not any(x.lower() == u.lower() for x in out):
        out.append(u)
    return out[:max_n]


def effective_llm_agreement_boost(extraction_quality: float | None) -> float:
    """Scale down LLM–rerank agreement boost when text extraction is unreliable."""
    base = float(LLM_CANDIDATE_AGREEMENT_BOOST)
    if base <= 0:
        return 0.0
    if extraction_quality is None:
        return base
    q = float(extraction_quality)
    lo = float(LLM_AGREEMENT_BOOST_MIN_QUALITY)
    hi = float(LLM_AGREEMENT_BOOST_FULL_QUALITY)
    if hi <= lo:
        return base if q >= lo else 0.0
    if q >= hi:
        return base
    if q <= lo:
        return 0.0
    return base * (q - lo) / (hi - lo)


def apply_llm_pick_boost(candidate_scores: list[dict], llm_folder: str, boost: float) -> list[dict]:
    """
    Raise the rerank score for the folder the LLM chose so top-two margin is not
    dominated by similar overlap scores across many existing folders (common cause
    of spurious 'Ambiguous folder match').
    """
    if boost <= 0:
        return candidate_scores
    llm = (llm_folder or "").strip().lower()
    if not llm or llm == UNCERTAIN_FOLDER.lower():
        return candidate_scores
    out: list[dict] = []
    for s in candidate_scores:
        name = str(s.get("folder_name", ""))
        sc = float(s.get("score", 0.0))
        if name.strip().lower() == llm:
            sc = min(1.0, sc + boost)
        out.append({"folder_name": name, "score": sc})
    return out


def parse_scored_response(raw: str) -> dict:
    first = (raw or "").splitlines()[0].strip()[:240]
    fallback = {
        "folder_name": normalize_rel_dest(first),
        "confidence": 0.55,
        "reason": "Fallback parse",
    }

    try:
        parsed = json.loads(raw)
        return normalize_scored_dict(parsed, fallback)
    except Exception:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(raw[start : end + 1])
            return normalize_scored_dict(parsed, fallback)
        except Exception:
            pass

    return fallback


def normalize_scored_dict(parsed: dict, fallback: dict) -> dict:
    folder_raw = str(parsed.get("folder_name", "")).strip()
    folder_name = normalize_rel_dest(folder_raw) if folder_raw else fallback["folder_name"]
    reason = str(parsed.get("reason", "")).strip()[:120] or fallback["reason"]

    confidence = parsed.get("confidence", fallback["confidence"])
    try:
        confidence = float(confidence)
    except Exception:
        confidence = fallback["confidence"]
    confidence = max(0.0, min(1.0, confidence))

    pp_raw = parsed.get("primary_purpose", "")
    primary_purpose: str | None = None
    if isinstance(pp_raw, str) and pp_raw.strip():
        primary_purpose = pp_raw.strip()[:200]

    out: dict[str, Any] = {"folder_name": folder_name, "confidence": confidence, "reason": reason}
    if primary_purpose:
        out["primary_purpose"] = primary_purpose
    return out


_CAREER_TOKENS: frozenset[str] = frozenset({
    "resume", "curriculum", "vitae", "experience", "skills",
    "education", "internship", "stage", "formation", "competences",
    "profil", "profile", "diplome", "diplôme",
})
_FINANCE_DOMAIN_TOKENS: frozenset[str] = frozenset({
    "finance", "financier", "portfolio", "virement", "investment",
})


def intent_boost(candidate_folder: str, tokens: set[str]) -> float:
    name = (candidate_folder or "").lower()
    intents = {
        "certificat": {"certificat", "attestation", "travail", "employment"},
        "invoice": {"invoice", "facture", "payment", "vendor"},
        "contract": {"contract", "contrat", "agreement", "nda"},
        "hr": {"payslip", "salary", "rh", "employee", "recruitment"},
        "admin": {"administratif", "administration", "official", "document"},
        "bank": {"bank", "bancaire", "releve", "relevé", "iban", "ubs", "transaction", "statement", "carte"},
        "financ": _FINANCE_DOMAIN_TOKENS,
        "insurance": {"insurance", "assurance", "police", "claim", "maladie", "avs", "lamal", "sinistre"},
        "bail": {"bail", "lease", "loyer", "locataire", "housing", "logement", "landlord"},
        "career": _CAREER_TOKENS,
    }
    boost = 0.0
    for label, kws in intents.items():
        if label in name and tokens & kws:
            boost = max(boost, 0.15)

    # Conflict guard: a document that contains both finance keywords AND strong career signals
    # (e.g. a CV listing a finance degree) should not receive the finance boost on Finance folders.
    if (
        boost > 0
        and "financ" in name
        and "career" not in name
        and tokens & _CAREER_TOKENS
        and tokens & _FINANCE_DOMAIN_TOKENS
    ):
        boost = 0.0

    return boost


def rerank_candidate(
    candidate_folder: str,
    text: str,
    folder_context: dict | None,
    filename_tokens: list[str] | None = None,
    *,
    filename_emphasis: float = 0.0,
) -> float:
    """
    Deterministic score in [0,1] for a candidate folder.

    When ``filename_emphasis`` > 0 and filename tokens exist, adds extra credit for
    overlaps driven by the filename alone so calendar-like bodies do not drown
    short, high-signal stems (see classify_candidates tie / low-confidence triggers).
    """
    folder_context = folder_context or {}
    filename_tokens = [t.lower() for t in (filename_tokens or [])]
    fn_set = set(filename_tokens)
    latin_tokens = set(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,}", (text or "").lower()))
    arabic_tokens = set(re.findall(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{2,}", text or ""))
    text_tokens = latin_tokens | arabic_tokens
    if not text_tokens:
        text_tokens = set(filename_tokens)

    folder_tokens = set(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,}", (candidate_folder or "").lower()))
    keyword_tokens = set(str(k).lower() for k in folder_context.get("keywords", []) if isinstance(k, str))
    sample_tokens: set[str] = set()
    for sample in folder_context.get("samples", [])[:3]:
        if isinstance(sample, str):
            sample_tokens.update(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,}", sample.lower()))

    def overlap(a: set[str], b: set[str]) -> float:
        if not a or not b:
            return 0.0
        return len(a & b) / max(1, len(a))

    merged = text_tokens | fn_set

    def blended_overlap(a: set[str]) -> float:
        base = overlap(a, merged)
        if filename_emphasis <= 0 or not fn_set:
            return base
        fn_only = overlap(a, fn_set)
        return min(1.0, base + float(filename_emphasis) * fn_only)

    name_overlap = blended_overlap(folder_tokens)
    keyword_overlap = blended_overlap(keyword_tokens)
    sample_overlap = blended_overlap(sample_tokens)

    score = (0.45 * name_overlap) + (0.35 * keyword_overlap) + (0.2 * sample_overlap)
    score += intent_boost(candidate_folder, text_tokens | fn_set)
    score += geo_rerank_adjustment(text, candidate_folder)
    if candidate_folder.lower() == UNCERTAIN_FOLDER.lower():
        score = min(score, 0.2)
    return max(0.0, min(1.0, score))


def rank_existing_folders(
    text: str,
    existing_folders: list[str],
    folder_contexts: dict[str, dict],
    filename_tokens: list[str],
    *,
    filename_emphasis: float = 0.0,
) -> list[tuple[str, float]]:
    ranked: list[tuple[str, float]] = []
    for folder in existing_folders:
        score = rerank_candidate(
            folder,
            text,
            folder_contexts.get(folder, {}),
            filename_tokens,
            filename_emphasis=filename_emphasis,
        )
        ranked.append((folder, score))
    ranked.sort(key=lambda it: it[1], reverse=True)
    return ranked