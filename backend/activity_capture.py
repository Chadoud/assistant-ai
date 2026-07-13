"""
Opt-in screen-activity capture service (Rewind-lite).

A single background thread periodically grabs a screenshot, reads the active
window title, asks the vision model for a one-line description of what the user
is doing, and stores ONLY that text in ``activity_store``. The raw screenshot is
held in memory just long enough to describe it, then discarded — no pixels are
persisted.

Capture is strictly opt-in and pausable, with an app/title exclusion list so the
user can keep sensitive windows (password managers, banking, etc.) out of the
timeline entirely. The frontend shows a visible recording indicator while the
``running`` flag here is true.
"""

from __future__ import annotations

import io
import logging
import threading
import time
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_INTERVAL_SEC = 90
_LIGHT_INTERVAL_SEC = 180
_MIN_INTERVAL_SEC = 20
_RETENTION_DAYS = 14
VALID_CAPTURE_MODES = frozenset({"off", "light", "standard"})


class _CaptureState:
    """Thread-safe holder for the capture loop's runtime state + settings."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.running = False
        self.interval_sec = _DEFAULT_INTERVAL_SEC
        self.retention_days = _RETENTION_DAYS
        # Lowercased substrings; if any appears in the app or window title the
        # frame is skipped entirely (never described, never stored).
        self.exclusions: list[str] = ["1password", "bitwarden", "keychain", "lastpass"]
        self.paused_until: float = 0.0
        self.last_capture_at: str | None = None
        self.last_error: str | None = None
        self.last_notice: str | None = None
        self.captured_count = 0
        self.capture_mode: str = "standard"
        self._last_window_key: str = ""

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = time.time()
            return {
                "running": self.running,
                "interval_sec": self.interval_sec,
                "retention_days": self.retention_days,
                "exclusions": list(self.exclusions),
                "paused": now < self.paused_until,
                "paused_until": (
                    datetime.fromtimestamp(self.paused_until, UTC).isoformat()
                    if now < self.paused_until
                    else None
                ),
                "last_capture_at": self.last_capture_at,
                "last_error": self.last_error,
                "last_notice": self.last_notice,
                "captured_count": self.captured_count,
                "capture_mode": self.capture_mode,
            }


_state = _CaptureState()


def _normalize_window_title(win: Any) -> str:
    """Return a plain window title string; never a bound-method repr."""
    if win is None:
        return ""
    title_attr = getattr(win, "title", None)
    if callable(title_attr):
        try:
            title_attr = title_attr()
        except Exception:
            title_attr = ""
    if isinstance(title_attr, str) and title_attr.strip():
        cleaned = title_attr.strip()
        if "<built-in method" in cleaned or "<bound method" in cleaned:
            return ""
        return cleaned
    fallback = str(win).strip()
    if "<built-in method" in fallback or "<bound method" in fallback:
        return ""
    return fallback


def _active_window() -> tuple[str, str]:
    """Return (app_or_process, window_title), best-effort and never raising."""
    try:
        import pygetwindow as gw  # type: ignore[import]

        win = gw.getActiveWindow()
        return ("", _normalize_window_title(win))
    except Exception:
        return ("", "")


def _grab_jpeg() -> bytes | None:
    try:
        import mss  # type: ignore[import-untyped]
        from mss import tools as mss_tools
        from PIL import Image

        with mss.mss() as sct:
            mon = sct.monitors[1]
            shot = sct.grab(mon)
            png = mss_tools.to_png(shot.rgb, shot.size)
        img = Image.open(io.BytesIO(png)).convert("RGB")
        # Downscale to keep vision cost/latency low — detail isn't needed for a summary.
        img.thumbnail((1280, 1280))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return buf.getvalue()
    except Exception as exc:
        logger.debug("activity capture grab failed: %s", exc)
        return None


def _is_excluded(app: str, title: str) -> bool:
    hay = f"{app} {title}".lower()
    with _state._lock:
        exclusions = list(_state.exclusions)
    return any(term and term in hay for term in exclusions)


def _describe(image: bytes, *, app: str, title: str) -> tuple[str | None, str | None, str | None]:
    """Return (summary, user_notice, user_error)."""
    from activity_vision import describe_activity_screenshot

    result = describe_activity_screenshot(image, app=app, title=title)
    return result.summary, result.user_notice, result.user_error


def _capture_once(*, force: bool = False) -> None:
    app, title = _active_window()
    window_key = f"{app}|{title}".strip("|")
    with _state._lock:
        window_changed = bool(window_key and window_key != _state._last_window_key)
        if window_key:
            _state._last_window_key = window_key
    if _is_excluded(app, title):
        return
    if not force and not window_changed:
        pass  # interval-driven capture still runs full pipeline
    image = _grab_jpeg()
    if not image:
        return
    summary, notice, error = _describe(image, app=app, title=title)
    # image goes out of scope here and is garbage-collected — never persisted.
    if not summary:
        with _state._lock:
            _state.last_error = error
            _state.last_notice = None
        return
    import activity_store

    activity_store.add_activity(app, title, summary)
    with _state._lock:
        _state.last_capture_at = datetime.now(UTC).isoformat()
        _state.captured_count += 1
        _state.last_error = None
        _state.last_notice = notice


def _loop() -> None:
    import activity_store

    last_prune = 0.0
    while not _state._stop.is_set():
        try:
            now = time.time()
            with _state._lock:
                interval = _state.interval_sec
                paused = now < _state.paused_until
                retention = _state.retention_days
            if not paused:
                app, title = _active_window()
                window_key = f"{app}|{title}".strip("|")
                with _state._lock:
                    window_changed = bool(window_key and window_key != _state._last_window_key)
                if window_changed:
                    _capture_once(force=True)
                else:
                    _capture_once()
            if now - last_prune > 3600:  # prune at most hourly
                activity_store.prune_older_than(retention)
                last_prune = now
        except Exception:
            logger.exception("activity capture loop iteration failed")
        _state._stop.wait(timeout=max(_MIN_INTERVAL_SEC, interval))


def set_capture_mode(mode: str) -> dict[str, Any]:
    """Light / standard / off — maps to interval and running state."""
    normalized = (mode or "standard").strip().lower()
    if normalized not in VALID_CAPTURE_MODES:
        normalized = "standard"
    with _state._lock:
        _state.capture_mode = normalized
        if normalized == "light":
            _state.interval_sec = _LIGHT_INTERVAL_SEC
        elif normalized == "standard":
            _state.interval_sec = _DEFAULT_INTERVAL_SEC
    if normalized == "off":
        return stop()
    if not _state.running:
        return start()
    return _state.snapshot()


def start(
    *, interval_sec: int | None = None, retention_days: int | None = None
) -> dict[str, Any]:
    with _state._lock:
        if interval_sec is not None:
            _state.interval_sec = max(_MIN_INTERVAL_SEC, int(interval_sec))
        if retention_days is not None:
            _state.retention_days = max(1, int(retention_days))
        if _state.running:
            return _state.snapshot()
        _state._stop.clear()
        _state.running = True
        _state._thread = threading.Thread(target=_loop, name="activity-capture", daemon=True)
        _state._thread.start()
    logger.info("activity capture started")
    return _state.snapshot()


def stop() -> dict[str, Any]:
    with _state._lock:
        _state._stop.set()
        _state.running = False
    logger.info("activity capture stopped")
    return _state.snapshot()


def pause_for(minutes: int) -> dict[str, Any]:
    with _state._lock:
        _state.paused_until = time.time() + max(1, minutes) * 60
    return _state.snapshot()


def resume() -> dict[str, Any]:
    with _state._lock:
        _state.paused_until = 0.0
    return _state.snapshot()


def set_exclusions(terms: list[str]) -> dict[str, Any]:
    cleaned = [t.strip().lower() for t in terms if isinstance(t, str) and t.strip()]
    with _state._lock:
        _state.exclusions = cleaned
    return _state.snapshot()


def status() -> dict[str, Any]:
    return _state.snapshot()
