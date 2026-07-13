"""
Phonetic + fuzzy matching for resolving a spoken name to a known contact.

Voice transcription frequently mangles names ("Chady" → "Shady", "Kassab" →
"Ashab"). Exact-string lookups miss these, so this module scores how closely a
spoken name resembles a candidate by combining:

  * Jaro-Winkler similarity — robust to insertions/transpositions and favouring a
    shared prefix (handles "Chady" ↔ "Shady").
  * Soundex equality — a phonetic bonus when two tokens encode to the same sound.

Everything here is pure and dependency-free so it can be unit-tested without any
network or Gmail access. The Gmail harvesting that feeds candidates in lives in
``google_workspace_tool``.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

# A token must clear this blended score to count as a confident match for the
# whole name. Tuned so "Shady" matches "Chady" but unrelated names do not.
HIGH_CONFIDENCE_SCORE = 0.86
MEDIUM_CONFIDENCE_SCORE = 0.70

_SOUNDEX_CODES = {
    "b": "1", "f": "1", "p": "1", "v": "1",
    "c": "2", "g": "2", "j": "2", "k": "2", "q": "2", "s": "2", "x": "2", "z": "2",
    "d": "3", "t": "3",
    "l": "4",
    "m": "5", "n": "5",
    "r": "6",
}


def normalize_name(value: str) -> str:
    """Lowercase, strip accents, and keep only letters and spaces."""
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    kept = [c.lower() if (c.isalpha() or c.isspace()) else " " for c in ascii_only]
    return " ".join("".join(kept).split())


def tokenize_name(value: str) -> list[str]:
    """Split a normalized name into alphabetic tokens of length >= 2."""
    return [tok for tok in normalize_name(value).split(" ") if len(tok) >= 2]


def soundex(token: str) -> str:
    """Classic Soundex code (letter + 3 digits) for a single token."""
    token = normalize_name(token).replace(" ", "")
    if not token:
        return ""
    first = token[0]
    encoded = [_SOUNDEX_CODES.get(ch, "") for ch in token]
    squeezed: list[str] = []
    previous = encoded[0]
    for code in encoded[1:]:
        if code and code != previous:
            squeezed.append(code)
        if code != "":
            previous = code
        else:
            previous = ""
    digits = "".join(squeezed)
    return (first.upper() + digits + "000")[:4]


def jaro_winkler(left: str, right: str) -> float:
    """Jaro-Winkler similarity in [0, 1]; 1.0 means identical strings."""
    if left == right:
        return 1.0
    if not left or not right:
        return 0.0

    match_window = max(len(left), len(right)) // 2 - 1
    if match_window < 0:
        match_window = 0

    left_matched = [False] * len(left)
    right_matched = [False] * len(right)
    matches = 0
    for i, ch in enumerate(left):
        start = max(0, i - match_window)
        end = min(i + match_window + 1, len(right))
        for j in range(start, end):
            if not right_matched[j] and right[j] == ch:
                left_matched[i] = True
                right_matched[j] = True
                matches += 1
                break
    if matches == 0:
        return 0.0

    transpositions = 0
    k = 0
    for i, ch in enumerate(left):
        if left_matched[i]:
            while not right_matched[k]:
                k += 1
            if ch != right[k]:
                transpositions += 1
            k += 1
    transpositions //= 2

    jaro = (
        matches / len(left)
        + matches / len(right)
        + (matches - transpositions) / matches
    ) / 3.0

    prefix = 0
    for cl, cr in zip(left, right):
        if cl == cr and prefix < 4:
            prefix += 1
        else:
            break
    return jaro + prefix * 0.1 * (1 - jaro)


def token_similarity(left: str, right: str) -> float:
    """Blend string and phonetic similarity for two single tokens."""
    if not left or not right:
        return 0.0
    string_score = jaro_winkler(left, right)
    phonetic_match = bool(soundex(left)) and soundex(left) == soundex(right)
    # A phonetic hit floors the score high even when spelling diverges.
    return max(string_score, 0.9) if phonetic_match else string_score


def name_similarity(query: str, candidate: str) -> float:
    """
    Similarity in [0, 1] between a spoken name and a candidate display name.

    Each query token is aligned to its best-matching candidate token; the overall
    score is the average of those best matches. This rewards matching every part
    the user said while tolerating extra tokens in the candidate (middle names).
    """
    query_tokens = tokenize_name(query)
    candidate_tokens = tokenize_name(candidate)
    if not query_tokens or not candidate_tokens:
        return 0.0

    total = 0.0
    for q_tok in query_tokens:
        total += max(token_similarity(q_tok, c_tok) for c_tok in candidate_tokens)
    return total / len(query_tokens)


@dataclass(frozen=True)
class Candidate:
    """A possible recipient harvested from the user's mailbox."""

    name: str
    email: str
    frequency: int = 1


@dataclass(frozen=True)
class ScoredCandidate:
    name: str
    email: str
    score: float
    confidence: str


def _confidence_label(score: float) -> str:
    if score >= HIGH_CONFIDENCE_SCORE:
        return "high"
    if score >= MEDIUM_CONFIDENCE_SCORE:
        return "medium"
    return "low"


def rank_candidates(
    query: str,
    candidates: list[Candidate],
    *,
    limit: int = 5,
) -> list[ScoredCandidate]:
    """
    Rank candidates by how closely they resemble ``query``.

    Scores the query against both the display name and the email's local part
    (so "shadykassab@…" still matches when no display name exists). A small
    frequency tie-breaker favours people the user corresponds with often.
    """
    scored: list[ScoredCandidate] = []
    seen_emails: set[str] = set()
    for cand in candidates:
        email = cand.email.strip().lower()
        if not email or email in seen_emails:
            continue
        seen_emails.add(email)
        local_part = email.split("@", 1)[0]
        score = max(
            name_similarity(query, cand.name),
            name_similarity(query, local_part.replace(".", " ").replace("_", " ")),
        )
        scored.append(
            ScoredCandidate(
                name=cand.name or email,
                email=email,
                score=round(score, 4),
                confidence=_confidence_label(score),
            )
        )

    scored.sort(
        key=lambda s: (
            s.score,
            next((c.frequency for c in candidates if c.email.lower() == s.email), 0),
        ),
        reverse=True,
    )
    return scored[:limit]
