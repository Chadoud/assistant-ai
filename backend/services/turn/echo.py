"""Speaker-echo detection for voice input transcriptions (TurnService)."""

from __future__ import annotations

import re
import unicodedata

_MIN_ECHO_FRAGMENT_CHARS = 10
_MIN_ECHO_WORD_OVERLAP = 0.72
_MIN_ECHO_WORD_COUNT = 3

# Function words that often align between a real user request and a prior assistant
# paraphrase — must not trigger echo on their own.
_ECHO_STOPWORDS = frozenset({
    "pour", "demain", "que", "qu", "j", "je", "a", "du", "de", "le", "la", "les",
    "un", "une", "des", "et", "en", "au", "aux", "the", "to", "an", "and", "or",
    "your", "my", "midi", "heure", "heures", "tomorrow", "today", "l", "ai",
    "vous", "ton", "votre", "une",
})


def normalize_echo_text(text: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace."""
    lowered = text.lower()
    decomposed = unicodedata.normalize("NFKD", lowered)
    asciiish = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"[^\w\s]", " ", asciiish, flags=re.UNICODE)
    return " ".join(cleaned.split())


def _ordered_word_run_in_assistant(
    user_words: list[str],
    assistant_words: list[str],
    *,
    min_run: int = 3,
) -> bool:
    """True when ``min_run`` consecutive user words appear in order inside assistant."""
    if len(user_words) < min_run or not assistant_words:
        return False
    for start in range(len(user_words) - min_run + 1):
        run = user_words[start : start + min_run]
        # Skip runs that are only scheduling filler shared with any calendar reply.
        if sum(1 for w in run if w not in _ECHO_STOPWORDS) < 2:
            continue
        cursor = 0
        for word in run:
            while cursor < len(assistant_words) and assistant_words[cursor] != word:
                cursor += 1
            if cursor >= len(assistant_words):
                break
            cursor += 1
        else:
            return True
    return False


def looks_like_acoustic_echo(user_text: str, assistant_text: str) -> bool:
    """
    Strict playback bleed: ``user_text`` is a contiguous fragment of assistant TTS.

    Used at ``turn_complete`` against prior turns only — avoids false positives when
    the user request and the assistant paraphrase share common words (``pour demain``).
    """
    user_norm = normalize_echo_text(user_text)
    assistant_norm = normalize_echo_text(assistant_text)
    if not user_norm or not assistant_norm:
        return False
    if len(user_norm) >= _MIN_ECHO_FRAGMENT_CHARS and user_norm in assistant_norm:
        return True
    if len(assistant_norm) >= _MIN_ECHO_FRAGMENT_CHARS and assistant_norm in user_norm:
        return True
    return False


def looks_like_echo_of_prior_assistant(
    user_text: str,
    *prior_assistant_lines: str,
) -> bool:
    """Echo check for turn_complete — prior assistant lines only, substring bleed."""
    for candidate in prior_assistant_lines:
        stripped = candidate.strip()
        if stripped and looks_like_acoustic_echo(user_text, stripped):
            return True
    return False


def looks_like_speaker_echo(
    user_text: str,
    assistant_text: str,
    *,
    min_fragment_chars: int = _MIN_ECHO_FRAGMENT_CHARS,
) -> bool:
    """
    True when ``user_text`` is plausibly the mic picking up ``assistant_text``.

    Handles partial STT fragments (substring) and high word overlap on short clips.
    """
    user_norm = normalize_echo_text(user_text)
    assistant_norm = normalize_echo_text(assistant_text)
    if not user_norm or not assistant_norm:
        return False

    if len(user_norm) >= min_fragment_chars and user_norm in assistant_norm:
        return True
    if len(assistant_norm) >= min_fragment_chars and assistant_norm in user_norm:
        return True

    user_words = user_norm.split()
    assistant_words = assistant_norm.split()
    if _ordered_word_run_in_assistant(user_words, assistant_words):
        return True

    if len(user_words) < _MIN_ECHO_WORD_COUNT:
        return False

    assistant_word_set = set(assistant_words)
    overlap = sum(1 for w in user_words if w in assistant_word_set) / len(user_words)
    return overlap >= _MIN_ECHO_WORD_OVERLAP


def looks_like_echo_of_any(
    user_text: str,
    *assistant_candidates: str,
) -> bool:
    """True if ``user_text`` matches any non-empty assistant candidate."""
    for candidate in assistant_candidates:
        stripped = candidate.strip()
        if stripped and looks_like_speaker_echo(user_text, stripped):
            return True
    return False
