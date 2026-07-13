"""
Tiered screenshot summarization for opt-in activity capture.

Cloud vision (with provider relay) → local Ollama vision → app/window title fallback.
Screenshots are never persisted; only the returned summary string is stored.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

ACTIVITY_VISION_PROMPT = (
    "Look at this screenshot of the user's screen and describe in ONE short "
    "sentence what the user appears to be doing (the activity/task), not a list "
    "of UI elements. Be concrete but concise. If the screen is a lock screen, "
    "desktop, or empty, reply exactly: IDLE."
)

_CLOUD_BACKOFF_SEC = 120

_cloud_backoff_until: float = 0.0


class SummarySource(str, Enum):
    """Which tier produced the stored activity line."""

    AI = "ai"
    WINDOW = "window"


@dataclass(frozen=True)
class ActivityDescribeResult:
    """Outcome of one describe attempt."""

    summary: str | None
    source: SummarySource | None
    user_notice: str | None
    user_error: str | None


def reset_cloud_backoff_for_tests() -> None:
    """Clear transient cloud backoff (unit tests only)."""
    global _cloud_backoff_until
    _cloud_backoff_until = 0.0


def format_activity_user_error(raw: str | None) -> str | None:
    """Map provider errors to plain-language status for the Activity tab."""
    if not raw or not raw.strip():
        return "Couldn't summarize this capture. Will retry on the next interval."
    low = raw.lower()
    if "503" in low or "high demand" in low:
        return "Cloud AI is busy right now. Trying local vision or app name instead."
    if "429" in low or "rate limit" in low or "quota" in low or "resource_exhausted" in low:
        return "Cloud AI rate limit reached. Trying local vision or app name instead."
    if "no vision-capable" in low:
        return "No vision AI configured — add a Gemini key or install a local vision model."
    if "401" in low or "invalid api key" in low or "403" in low:
        return "Cloud vision key rejected. Check Settings or use a local vision model."
    return "Couldn't summarize this capture. Will retry on the next interval."


def _clean_summary(text: str | None) -> str | None:
    cleaned = (text or "").strip()
    if not cleaned or cleaned.upper().startswith("IDLE"):
        return None
    return cleaned[:600]


def _window_fallback(app: str, title: str) -> str | None:
    app_name = (app or "").strip()
    window_title = (title or "").strip()
    if window_title and app_name and window_title.lower() not in app_name.lower():
        return f"Working in {app_name} — {window_title}"[:600]
    if window_title:
        return f"Working in {window_title}"[:600]
    if app_name:
        return f"Working in {app_name}"[:600]
    return None


def _describe_via_orchestrator(image: bytes) -> tuple[str | None, str | None]:
    """
    Cloud + relay chain (Gemini → OpenAI → Anthropic → local Ollama).

    Returns (summary, raw_error).
    """
    global _cloud_backoff_until
    if time.time() < _cloud_backoff_until:
        return None, "cloud backoff active"

    from orchestrator.health import is_transient_error
    from orchestrator.vision import VisionError, vision_complete

    try:
        text = vision_complete(ACTIVITY_VISION_PROMPT, image)
        _cloud_backoff_until = 0.0
        return _clean_summary(text), None
    except VisionError as exc:
        msg = str(exc)
        if is_transient_error(msg):
            _cloud_backoff_until = time.time() + _CLOUD_BACKOFF_SEC
        return None, msg


def describe_activity_screenshot(
    image: bytes,
    *,
    app: str,
    title: str,
) -> ActivityDescribeResult:
    """
    Summarize a screenshot with tiered fallbacks.

    :param image: JPEG screenshot bytes (held only for the duration of this call).
    :param app: active application name, if known.
    :param title: active window title, if known.
    """
    raw_error: str | None = None
    user_notice: str | None = None

    summary, err = _describe_via_orchestrator(image)
    if err:
        raw_error = err
        if err != "cloud backoff active":
            user_notice = format_activity_user_error(err)
    if summary:
        return ActivityDescribeResult(summary, SummarySource.AI, None, None)

    fallback = _window_fallback(app, title)
    if fallback:
        notice = user_notice or "Saved app and window title only — screen summary unavailable."
        return ActivityDescribeResult(fallback, SummarySource.WINDOW, notice, None)

    return ActivityDescribeResult(
        None,
        None,
        None,
        format_activity_user_error(raw_error),
    )
