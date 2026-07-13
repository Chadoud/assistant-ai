"""Resolve server-authoritative user text at voice turn_complete."""

from __future__ import annotations

from .echo import looks_like_echo_of_prior_assistant
from .quality import is_junk_voice_transcription


def resolve_user_turn_at_complete(
    raw_user_text: str,
    assistant_text: str,
    recent_assistant_lines: list[str],
) -> tuple[str, bool, str | None]:
    """
    Apply junk/echo filters and return commit payload for the client.

    Returns ``(committed_text, user_committed, drop_reason)``.

    Echo at turn_complete only checks **prior** assistant lines with strict substring
    bleed detection. Same-turn ``assistant_text`` is excluded — it naturally paraphrases
    the user and must not suppress the user bubble.
    """
    user_text = " ".join(raw_user_text.split()).strip()
    if not user_text:
        return "", False, "empty"

    if is_junk_voice_transcription(user_text):
        return "", False, "junk"

    if looks_like_echo_of_prior_assistant(user_text, *recent_assistant_lines):
        return "", False, "echo"

    return user_text, True, None
