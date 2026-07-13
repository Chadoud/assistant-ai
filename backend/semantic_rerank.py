"""Optional Ollama embedding similarity to rerank lexical candidates.

Two surfaces:
- ``blend_with_semantic_scores`` — folder classification candidates (sort pipeline).
- ``blend_lexical_with_embeddings`` — generic helper reused by memory and
  conversation search to re-score top lexical hits by cosine similarity.

Embeddings are always best-effort: when Ollama is unavailable the callers fall
back to pure lexical ranking with zero behavior change.
"""

from __future__ import annotations

import logging
import math
from typing import Callable, TypeVar

from llm.ollama_client import embeddings as _ollama_embeddings

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

# Cached embedding availability for this process. ``None`` = not yet probed,
# ``False`` = the embedding model is missing (every later call short-circuits to
# lexical ranking instead of re-hitting Ollama and re-logging the same 404).
_embeddings_available: bool | None = None

# Substrings in an Ollama error that mean the model isn't installed (vs. a
# transient connection blip, which we don't want to disable embeddings for).
_MODEL_MISSING_MARKERS = ("not found", "try pulling", "no such model")

# Short-lived query embedding cache (memory search may repeat similar queries).
_embed_cache: dict[tuple[str, str], list[float]] = {}
_EMBED_CACHE_MAX = 32

from constants import (
    SEMANTIC_RERANK_LEXICAL_WEIGHT,
    SEMANTIC_RERANK_MODEL,
    SEMANTIC_RERANK_SEMANTIC_WEIGHT,
)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _embed(model: str, prompt: str) -> list[float] | None:
    global _embeddings_available
    if _embeddings_available is False:
        return None
    try:
        p = (prompt or "").strip()
        if not p:
            return None
        sent_prompt = p[:8192]
        cache_key = (model, sent_prompt)
        cached = _embed_cache.get(cache_key)
        if cached is not None:
            return cached
        r = _ollama_embeddings(model=model, prompt=sent_prompt)
        emb = r.get("embedding")
        if isinstance(emb, list) and emb:
            _embeddings_available = True
            vector = [float(x) for x in emb]
            if len(_embed_cache) >= _EMBED_CACHE_MAX:
                _embed_cache.pop(next(iter(_embed_cache)))
            _embed_cache[cache_key] = vector
            return vector
    except Exception as exc:
        message = str(exc).lower()
        if any(marker in message for marker in _MODEL_MISSING_MARKERS):
            # Log the actionable hint once, then go quiet for the process lifetime.
            if _embeddings_available is not False:
                logger.warning(
                    "Semantic rerank disabled: embedding model %r unavailable on the "
                    "cloud LLM gateway. Ask ops to provision %s on the VPS; falling back "
                    "to lexical ranking.",
                    model, model,
                )
            _embeddings_available = False
        else:
            # Transient (Ollama down, timeout) — keep trying later without spamming.
            logger.debug("Ollama embedding failed model=%r: %s", model, exc)
    return None


def blend_lexical_with_embeddings(
    query: str,
    ranked: list[tuple[float, _T]],
    text_of: Callable[[_T], str],
    *,
    candidate_limit: int = 25,
    lexical_weight: float = 0.6,
    semantic_weight: float = 0.4,
    model: str | None = None,
) -> list[tuple[float, _T]] | None:
    """Re-score the top lexical candidates by embedding cosine similarity.

    ``ranked`` is a lexical-sorted list of ``(score, item)``. ``text_of`` extracts
    the text to embed for each item. Returns a re-ranked ``(score, item)`` list,
    or ``None`` when embeddings are unavailable (so callers keep lexical order).
    """
    if not ranked:
        return None
    m = (model or SEMANTIC_RERANK_MODEL).strip() or SEMANTIC_RERANK_MODEL
    q_emb = _embed(m, query)
    if not q_emb:
        return None

    blended: list[tuple[float, _T]] = []
    for lex, item in ranked[:candidate_limit]:
        e_emb = _embed(m, text_of(item))
        sim = max(0.0, min(1.0, _cosine(q_emb, e_emb))) if e_emb else 0.0
        blended.append((lexical_weight * lex + semantic_weight * sim, item))
    blended.extend(ranked[candidate_limit:])
    blended.sort(key=lambda x: x[0], reverse=True)
    return blended


def _folder_label(folder_name: str, folder_context: dict | None) -> str:
    fc = folder_context or {}
    parts: list[str] = [folder_name]
    prof = (fc.get("profile") or "").strip()
    if prof:
        parts.append(prof[:500])
    kws = fc.get("keywords", []) or []
    flat: list[str] = []
    if isinstance(kws, list):
        flat = [str(k).strip() for k in kws[:12] if isinstance(k, str) and str(k).strip()]
    if flat:
        if prof:
            parts.append("Keywords: " + ", ".join(flat[:8]))
        else:
            parts.append("Typical topics: " + ", ".join(flat))
    for s in fc.get("samples", [])[:2]:
        if isinstance(s, str) and s.strip():
            parts.append(s.strip()[:240])
    return " ".join(parts)[:4000]


def blend_with_semantic_scores(
    candidate_scores: list[dict],
    *,
    query_text: str,
    primary_purpose: str | None,
    folder_contexts: dict[str, dict],
    document_briefing: str | None = None,
    model: str | None = None,
    lexical_weight: float | None = None,
    semantic_weight: float | None = None,
) -> tuple[list[dict], bool]:
    """
    Re-rank candidates: blend lexical score with embedding cosine similarity.
    Returns (new_scores with keys folder_name, score only), True if embeddings succeeded.
    """
    m = (model or SEMANTIC_RERANK_MODEL).strip() or SEMANTIC_RERANK_MODEL
    lw = float(lexical_weight if lexical_weight is not None else SEMANTIC_RERANK_LEXICAL_WEIGHT)
    sw = float(semantic_weight if semantic_weight is not None else SEMANTIC_RERANK_SEMANTIC_WEIGHT)
    if lw + sw <= 0:
        return candidate_scores, False
    ssum = lw + sw
    lw, sw = lw / ssum, sw / ssum

    q_parts: list[str] = []
    br = (document_briefing or "").strip()
    if br:
        q_parts.append(br[:2200])
    qt = (query_text or "").strip()
    if "[Visual]" in qt:
        visual_idx = qt.find("[Visual]")
        ocr_idx = qt.find("[OCR]")
        if ocr_idx > visual_idx:
            q_parts.append(qt[visual_idx:ocr_idx].strip()[:3500])
        else:
            q_parts.append(qt[visual_idx:].strip()[:3500])
    else:
        q_parts.append(qt[:3500])
    if primary_purpose:
        q_parts.append(str(primary_purpose)[:400])
    q_emb = _embed(m, "\n".join(q_parts))
    if not q_emb:
        return candidate_scores, False

    cache: dict[str, list[float]] = {}
    out: list[dict] = []
    for row in candidate_scores:
        name = str(row.get("folder_name", ""))
        lex = float(row.get("score", 0.0))
        label = _folder_label(name, folder_contexts.get(name, {}))
        key = label[:2000]
        if key not in cache:
            cache[key] = _embed(m, key) or []
        c_emb = cache[key]
        sim = _cosine(q_emb, c_emb) if c_emb else 0.0
        sim01 = max(0.0, min(1.0, sim))
        blend = lw * lex + sw * sim01
        out.append({"folder_name": name, "score": blend})

    return out, True
