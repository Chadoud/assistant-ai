"""
Search the persistent assistant memory store.

Backs the ``search_memories`` tool and the Memories tab search box. Ranking is
lexical by default (token overlap + phrase/substring boosts) so it works fully
offline with zero API calls. When local Ollama embeddings are available the top
lexical candidates are re-scored by cosine similarity for better recall on
paraphrases — but embeddings are strictly optional and never block a result.

When ``EXOSITES_MEMORY_RECALL_SIGNAL=1``, lexical scores are blended with
recall_weight and last_recalled_at recency before optional embedding rerank.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from assistant_memory import list_all_memory_scoped, touch_memory_recall
from memory_recall_signal import RECALL_TOUCH_MIN_SCORE, apply_recall_signal_to_lexical

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[A-Za-z0-9]{2,}")
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "that", "this", "with", "from", "your", "you",
        "are", "was", "what", "who", "where", "when", "does", "did", "has",
        "have", "about", "tell", "show", "find", "search", "recall",
    }
)

# Only blend embeddings for a small candidate set to bound latency.
_EMBED_CANDIDATE_LIMIT = 25
_LEXICAL_WEIGHT = 0.6
_SEMANTIC_WEIGHT = 0.4


def _tokens(text: str) -> set[str]:
    return {
        t.lower()
        for t in _TOKEN_RE.findall(text or "")
        if t.lower() not in _STOPWORDS
    }


def _lexical_score(query: str, entry: dict[str, Any]) -> float:
    """Token-overlap score in [0, 1] with a boost for phrase substring hits."""
    q_tokens = _tokens(query)
    if not q_tokens:
        return 0.0
    haystack = f"{entry.get('key', '')} {entry.get('value', '')} {entry.get('category', '')}"
    e_tokens = _tokens(haystack)
    if not e_tokens:
        return 0.0
    overlap = len(q_tokens & e_tokens) / len(q_tokens)
    phrase_bonus = 0.25 if query.strip().lower() in haystack.lower() else 0.0
    return min(1.0, overlap + phrase_bonus)


def _rank_key(item: tuple[float, dict[str, Any]]) -> tuple[float, str, int]:
    score, entry = item
    updated = str(entry.get("updated_at") or "")
    row_id = int(entry.get("id") or 0)
    return (score, updated, row_id)


def _try_embedding_blend(
    query: str, ranked: list[tuple[float, dict[str, Any]]]
) -> list[tuple[float, dict[str, Any]]] | None:
    """Re-score top lexical candidates with Ollama embeddings; None if unavailable."""
    try:
        from semantic_rerank import blend_lexical_with_embeddings
    except Exception:
        return None

    return blend_lexical_with_embeddings(
        query,
        ranked,
        lambda entry: f"{entry.get('key', '')}: {entry.get('value', '')}",
        candidate_limit=_EMBED_CANDIDATE_LIMIT,
        lexical_weight=_LEXICAL_WEIGHT,
        semantic_weight=_SEMANTIC_WEIGHT,
    )


def search_memories(
    query: str,
    *,
    limit: int = 8,
    category: str | None = None,
    use_embeddings: bool = True,
) -> list[dict[str, Any]]:
    """Return memory entries ranked by relevance to ``query``.

    Each result is the stored entry dict plus a ``score`` float. Empty query
    returns the most recently updated entries (newest-first), so the tool is
    useful for "what do you know about me?" with no keywords.
    """
    entries = list_all_memory_scoped()
    from signal_quality import is_recall_visible

    entries = [e for e in entries if is_recall_visible(e)]
    if category:
        entries = [e for e in entries if e.get("category") == category]

    if not query.strip():
        visible = [e for e in entries if is_recall_visible(e)]
        return [{**e, "score": 0.0} for e in visible[:limit]]

    ranked = [
        (apply_recall_signal_to_lexical(_lexical_score(query, e), e), e) for e in entries
    ]
    ranked = [(s, e) for s, e in ranked if s > 0.0]
    ranked.sort(key=_rank_key, reverse=True)

    if use_embeddings and ranked:
        blended = _try_embedding_blend(query, ranked)
        if blended is not None:
            ranked = blended
            ranked.sort(key=_rank_key, reverse=True)

    top = ranked[:limit]
    touch_ids = [
        int(e["id"])
        for s, e in top
        if s >= RECALL_TOUCH_MIN_SCORE and e.get("id") is not None
    ]
    touch_memory_recall(touch_ids, source="search")

    return [{**e, "score": round(s, 4)} for s, e in top]
