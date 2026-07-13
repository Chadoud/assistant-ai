"""YouTube: open first search result or summarize via Gemini (lightweight)."""

from __future__ import annotations

import logging
import os
import platform
import re
import time
import urllib.parse
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)


def _os_name() -> str:
    sysname = platform.system()
    if sysname == "Darwin":
        return "mac"
    if os.name == "nt":
        return "windows"
    return "linux"


def _scrape_user_agent() -> str:
    """Chrome UA matching the host OS — a Windows UA from a Mac is an easy bot signal."""
    os_token = {
        "mac": "Macintosh; Intel Mac OS X 10_15_7",
        "windows": "Windows NT 10.0; Win64; x64",
        "linux": "X11; Linux x86_64",
    }[_os_name()]
    return (
        f"Mozilla/5.0 ({os_token}) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )


def _require_pyautogui() -> Any:
    try:
        import pyautogui  # type: ignore[import-untyped]

        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.06
        return pyautogui
    except ImportError as exc:
        raise RuntimeError("pyautogui is required for this action") from exc


def youtube_video(parameters: dict) -> dict:
    """
    Parameters:
        action: play | close | summarize
        query_or_url: search query or youtube URL (not required for close)
    """
    logger.debug("[action] youtube_video called args=%r", parameters)
    action = str(parameters.get("action", "play")).strip().lower()
    q = str(parameters.get("query_or_url", parameters.get("query", ""))).strip()

    if action == "close":
        return _close_youtube_window()

    if not q:
        return {"ok": False, "error": "query_or_url is required"}

    if action == "play":
        url = q if "youtube.com" in q or "youtu.be" in q else _first_video_url(q)
        if not url:
            return {"ok": False, "error": "No video URL found"}
        try:
            import webbrowser

            webbrowser.open(url)
            is_search_page = "results?search_query=" in url
            return {
                "ok": True,
                "data": {
                    "opened_url": url,
                    "hint": (
                        "YouTube search results opened — click the first result to play."
                        if is_search_page
                        else "Video opened."
                    ),
                },
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    if action == "summarize":
        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            return {"ok": False, "error": "GEMINI_API_KEY required for summarize"}
        from google import genai  # type: ignore[import]

        client = genai.Client(api_key=api_key)
        prompt = f"Summarize this YouTube request in 3 bullet points (no playback): {q}"
        resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt)
        return {"ok": True, "data": {"summary": (resp.text or "").strip()}}

    return {"ok": False, "error": f"Unknown action {action!r}"}


def _close_youtube_window() -> dict:
    """
    Close the YouTube browser window or tab.

    Strategy (Windows/Mac/Linux):
      1. If pygetwindow is available, find the window whose title contains
         "YouTube" and close it directly — most precise.
      2. Otherwise, bring any browser window containing "YouTube" to the
         foreground via pyautogui and send Ctrl+W (close tab).
      3. Last resort: just send Ctrl+W to whatever window currently has focus.
    """
    pg = _require_pyautogui()
    osn = _os_name()

    # ── Attempt 1: pygetwindow (optional but more precise) ────────────────
    try:
        import pygetwindow as gw  # type: ignore[import]

        wins = [w for w in gw.getAllWindows() if "YouTube" in (w.title or "")]
        if wins:
            wins[0].activate()
            time.sleep(0.4)
            if osn == "mac":
                pg.hotkey("command", "w")
            else:
                pg.hotkey("ctrl", "w")
            return {"ok": True, "data": {"method": "pygetwindow"}}
    except Exception:
        pass  # pygetwindow not installed or failed — try next approach

    # ── Attempt 2: Alt+Tab to find the YouTube window on Windows ──────────
    if osn == "windows":
        try:
            import ctypes
            EnumWindows = ctypes.windll.user32.EnumWindows
            GetWindowTextW = ctypes.windll.user32.GetWindowTextW
            IsWindowVisible = ctypes.windll.user32.IsWindowVisible
            SetForegroundWindow = ctypes.windll.user32.SetForegroundWindow

            youtube_hwnd = None

            @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
            def _enum_cb(hwnd: int, _: int) -> bool:
                nonlocal youtube_hwnd
                if IsWindowVisible(hwnd):
                    buf = ctypes.create_unicode_buffer(256)
                    GetWindowTextW(hwnd, buf, 256)
                    if "YouTube" in buf.value:
                        youtube_hwnd = hwnd
                        return False  # stop enumeration
                return True

            EnumWindows(_enum_cb, 0)
            if youtube_hwnd:
                SetForegroundWindow(youtube_hwnd)
                time.sleep(0.4)
                pg.hotkey("ctrl", "w")
                return {"ok": True, "data": {"method": "winapi"}}
        except Exception:
            pass

    # ── Attempt 3: send Ctrl+W to whatever is focused right now ───────────
    try:
        if osn == "mac":
            pg.hotkey("command", "w")
        else:
            pg.hotkey("ctrl", "w")
        return {"ok": True, "data": {"method": "hotkey_active_window"}}
    except Exception as exc:
        return {"ok": False, "error": f"Could not close YouTube window: {exc}"}


def _first_video_url(query: str) -> str:
    """
    Return the YouTube watch URL for the first search result.

    Primary: scrape YouTube's own search results page for the embedded
    ``ytInitialData`` JSON blob — the first ``"videoId"`` in that blob is
    the top result.  Scraping YouTube directly is far more reliable than
    going through DuckDuckGo because there are no redirect wrappers to decode.

    Fallback: return the search results page URL so *something* opens even
    when the scrape fails (user sees results and can click).
    """
    fallback = (
        "https://www.youtube.com/results?search_query="
        + urllib.parse.quote_plus(query)
    )
    try:
        search_url = (
            "https://www.youtube.com/results?search_query="
            + urllib.parse.quote_plus(query)
        )
        req = urllib.request.Request(
            search_url,
            headers={
                "User-Agent": _scrape_user_agent(),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # YouTube embeds all search result metadata as a JSON payload.
        # The first "videoId" occurrence belongs to the top search result.
        m = re.search(r'"videoId"\s*:\s*"([\w-]{11})"', html)
        if m:
            return f"https://www.youtube.com/watch?v={m.group(1)}"

        logger.warning("youtube scrape: no videoId found in ytInitialData, using fallback")
        return fallback
    except Exception:
        logger.exception("youtube search scrape")
        return fallback
