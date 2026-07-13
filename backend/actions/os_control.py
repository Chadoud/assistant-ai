"""Desktop automation via PyAutoGUI (keyboard, mouse, screenshot). Paths gated under user home."""

from __future__ import annotations

import logging
import platform
import subprocess
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Process names per browser on Windows / Mac / Linux
_BROWSER_PROCS: dict[str, dict[str, list[str]]] = {
    "chrome":  {"windows": ["chrome.exe"],   "mac": ["Google Chrome"],     "linux": ["chrome", "google-chrome"]},
    "firefox": {"windows": ["firefox.exe"],  "mac": ["Firefox"],           "linux": ["firefox"]},
    "edge":    {"windows": ["msedge.exe"],   "mac": ["Microsoft Edge"],    "linux": ["msedge"]},
    "safari":  {"windows": [],               "mac": ["Safari"],             "linux": []},
    "brave":   {"windows": ["brave.exe"],    "mac": ["Brave Browser"],     "linux": ["brave"]},
}

# Window-title fragments used to find the browser window for focus
_BROWSER_TITLE_HINTS: dict[str, list[str]] = {
    "chrome":  ["Google Chrome", "Chrome"],
    "firefox": ["Mozilla Firefox", "Firefox"],
    "edge":    ["Microsoft Edge", "Edge"],
    "safari":  ["Safari"],
    "brave":   ["Brave"],
}


def _os_name() -> str:
    s = platform.system()
    if s == "Darwin":
        return "mac"
    if s == "Windows":
        return "windows"
    return "linux"


def _require_pyautogui():
    try:
        import pyautogui  # type: ignore[import-untyped]

        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.05
        return pyautogui
    except ImportError as exc:
        raise RuntimeError("pyautogui is not installed. pip install pyautogui") from exc


def _home() -> Path:
    return Path.home()


def _safe_path(p: str) -> Path | None:
    try:
        path = Path(p).expanduser().resolve()
        if path.is_relative_to(_home()):
            return path
    except ValueError:
        pass
    return None


def os_control(parameters: dict) -> dict:
    """
    Parameters:
        action: type_text | click | hotkey | scroll | screenshot | close_browser
        text: for type_text
        x, y: for click (optional; center if omitted)
        keys: list[str] for hotkey
        clicks: int for scroll direction negative=up
        path: for screenshot (must be under home)
        browser: for close_browser — "chrome" | "firefox" | "edge" | "safari" | "brave"
        scope: for close_browser — "tab" (Ctrl+W) | "window" (Ctrl+Shift+W) | "all" (kill process)
    """
    logger.debug("[action] os_control called args=%r", parameters)
    action = str(parameters.get("action", "")).strip().lower()
    pg = _require_pyautogui()

    try:
        if action == "type_text":
            text = str(parameters.get("text", ""))
            interval = float(parameters.get("interval", 0.02))
            pg.typewrite(text, interval=interval)
            return {"ok": True, "data": {"typed_chars": len(text)}}

        if action == "click":
            x = parameters.get("x")
            y = parameters.get("y")
            button = str(parameters.get("button", "left"))
            if x is not None and y is not None:
                pg.click(int(x), int(y), button=button)
            else:
                pg.click(button=button)
            return {"ok": True, "data": {"clicked": True}}

        if action == "hotkey":
            keys = parameters.get("keys")
            if not isinstance(keys, list) or not keys:
                return {"ok": False, "error": "keys must be a non-empty list"}
            pg.hotkey(*[str(k) for k in keys])
            return {"ok": True, "data": {"hotkey": keys}}

        if action == "scroll":
            clicks = int(parameters.get("clicks", -3))
            pg.scroll(clicks)
            return {"ok": True, "data": {"scroll_clicks": clicks}}

        if action == "screenshot":
            raw = str(parameters.get("path", "")).strip()
            dest = _safe_path(raw)
            if not dest:
                return {"ok": False, "error": "Screenshot path must be under your home directory"}
            dest.parent.mkdir(parents=True, exist_ok=True)
            img = pg.screenshot()
            img.save(str(dest))
            return {"ok": True, "data": {"path": str(dest)}}

        if action == "close_browser":
            browser = str(parameters.get("browser", "chrome")).strip().lower()
            scope = str(parameters.get("scope", "tab")).strip().lower()
            return _close_browser(pg, browser, scope)

        return {"ok": False, "error": f"Unknown action: {action!r}"}
    except Exception as exc:
        logger.exception("os_control")
        return {"ok": False, "error": str(exc)}


def _close_browser(pg: object, browser: str, scope: str) -> dict:
    """
    Close a browser tab, window, or all instances.

    scope:
      "tab"    → focus the browser, send Ctrl+W (close one tab)
      "window" → focus the browser, send Ctrl+Shift+W (close whole window)
      "all"    → kill every process matching the browser (taskkill on Windows)

    Strategy for "tab" / "window":
      1. Win32 API (Windows) — enumerate visible windows, find title match,
         SetForegroundWindow → send hotkey.
      2. pygetwindow fallback — same logic, different API.
      3. Last resort — send hotkey to whatever is currently focused.
    """
    osn = _os_name()
    logger.debug("[close_browser] browser=%s scope=%s os=%s", browser, scope, osn)

    # ── kill all processes ────────────────────────────────────────────────────
    if scope == "all":
        procs = _BROWSER_PROCS.get(browser, {}).get(osn, [])
        if not procs:
            return {"ok": False, "error": f"No known process name for {browser!r} on {osn}"}
        killed: list[str] = []
        errors: list[str] = []
        for proc in procs:
            try:
                if osn == "windows":
                    subprocess.run(
                        ["taskkill", "/F", "/IM", proc],
                        capture_output=True, check=False, timeout=8,
                    )
                elif osn == "mac":
                    subprocess.run(
                        ["osascript", "-e", f'quit app "{proc}"'],
                        capture_output=True, check=False, timeout=8,
                    )
                else:
                    subprocess.run(
                        ["pkill", "-f", proc],
                        capture_output=True, check=False, timeout=8,
                    )
                killed.append(proc)
            except Exception as exc:
                errors.append(f"{proc}: {exc}")
        if errors and not killed:
            return {"ok": False, "error": "; ".join(errors)}
        return {"ok": True, "data": {"method": "kill_process", "killed": killed}}

    # ── close tab or window via hotkey after focusing ─────────────────────────
    hotkey_combo = ("ctrl", "shift", "w") if scope == "window" else ("ctrl", "w")

    title_hints = _BROWSER_TITLE_HINTS.get(browser, [browser.capitalize()])
    focused = False

    # Attempt 1: Win32 API (Windows only, no extra deps)
    if osn == "windows" and not focused:
        try:
            import ctypes

            EnumWindows = ctypes.windll.user32.EnumWindows
            GetWindowTextW = ctypes.windll.user32.GetWindowTextW
            IsWindowVisible = ctypes.windll.user32.IsWindowVisible
            SetForegroundWindow = ctypes.windll.user32.SetForegroundWindow

            found_hwnd = None

            @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
            def _enum_cb(hwnd: int, _: int) -> bool:
                nonlocal found_hwnd
                if IsWindowVisible(hwnd):
                    buf = ctypes.create_unicode_buffer(256)
                    GetWindowTextW(hwnd, buf, 256)
                    title = buf.value
                    if any(hint in title for hint in title_hints):
                        found_hwnd = hwnd
                        return False  # stop on first match
                return True

            EnumWindows(_enum_cb, 0)
            if found_hwnd:
                SetForegroundWindow(found_hwnd)
                time.sleep(0.4)
                pg.hotkey(*hotkey_combo)  # type: ignore[attr-defined]
                return {"ok": True, "data": {"method": "win32api", "hotkey": list(hotkey_combo)}}
        except Exception as e:
            logger.debug("[close_browser] win32 attempt failed: %s", e)

    # Attempt 2: pygetwindow
    if not focused:
        try:
            import pygetwindow as gw  # type: ignore[import]

            wins = [
                w for w in gw.getAllWindows()
                if any(hint in (w.title or "") for hint in title_hints)
            ]
            if wins:
                wins[0].activate()
                time.sleep(0.4)
                pg.hotkey(*hotkey_combo)  # type: ignore[attr-defined]
                return {"ok": True, "data": {"method": "pygetwindow", "hotkey": list(hotkey_combo)}}
        except Exception as e:
            logger.debug("[close_browser] pygetwindow attempt failed: %s", e)

    # Attempt 3: send hotkey to active window (best-effort)
    try:
        if osn == "mac":
            mac_combo = ("command",) + hotkey_combo[1:]
            pg.hotkey(*mac_combo)  # type: ignore[attr-defined]
        else:
            pg.hotkey(*hotkey_combo)  # type: ignore[attr-defined]
        return {"ok": True, "data": {"method": "hotkey_active_window", "hotkey": list(hotkey_combo)}}
    except Exception as exc:
        return {"ok": False, "error": f"Could not close browser: {exc}"}
