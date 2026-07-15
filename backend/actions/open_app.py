"""Launch and close desktop applications (platform-specific)."""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

HOME = Path.home()

# Common app-name → process-name mappings for taskkill / pkill
_APP_PROCESS_MAP: dict[str, list[str]] = {
    "whatsapp":  ["WhatsApp.exe", "WhatsApp"],
    "chrome":    ["chrome.exe", "Google Chrome"],
    "firefox":   ["firefox.exe", "Firefox"],
    "edge":      ["msedge.exe", "Microsoft Edge"],
    "spotify":   ["Spotify.exe", "Spotify"],
    "discord":   ["Discord.exe", "Discord"],
    "slack":     ["slack.exe", "Slack"],
    "zoom":      ["Zoom.exe", "zoom.us"],
    "teams":     ["Teams.exe", "Microsoft Teams"],
    "telegram":  ["Telegram.exe", "Telegram"],
    "vlc":       ["vlc.exe", "VLC"],
    "notepad":   ["notepad.exe"],
    "calculator":["Calculator.exe"],
    "explorer":  ["explorer.exe"],
    "word":      ["WINWORD.EXE"],
    "excel":     ["EXCEL.EXE"],
    "powerpoint":["POWERPNT.EXE"],
}

_KNOWN_APP_KEYS = frozenset(_APP_PROCESS_MAP.keys())


def _resolve_under_home(p: str) -> Path | None:
    try:
        resolved = Path(p).expanduser().resolve()
        if resolved.is_relative_to(HOME):
            return resolved
    except (ValueError, OSError):
        pass
    return None


def _looks_like_path(target: str) -> bool:
    t = target.strip()
    if not t:
        return False
    if "/" in t or "\\" in t:
        return True
    suffix = Path(t).suffix.lower()
    if suffix in {".exe", ".lnk", ".app", ".deb", ".dmg"}:
        return True
    try:
        return Path(t).expanduser().exists()
    except OSError:
        return False


def _match_known_app(target: str) -> bool:
    key = _normalize_app_key(target)
    if key in _KNOWN_APP_KEYS:
        return True
    return any(known in key for known in _KNOWN_APP_KEYS)


def _normalize_app_key(target: str) -> str:
    return target.lower().replace(" ", "").replace("-", "")


def open_app(parameters: dict) -> dict:
    """
    Open an application by known name or an executable path under home.

    Parameters:
        target: App name (preferred) or executable/.app path under the user's home.
    """
    logger.debug("[action] open_app called args=%r", parameters)
    target = str(parameters.get("target", "")).strip()
    if not target:
        return {"ok": False, "error": "target is required"}

    path_like = _looks_like_path(target)

    if path_like:
        resolved = _resolve_under_home(target)
        if not resolved:
            return {"ok": False, "error": "executable paths must be under the home directory"}
        launch_target = str(resolved)
    elif _match_known_app(target):
        launch_target = target
    else:
        return {
            "ok": False,
            "error": (
                f"Unknown application {target!r}. Use a known app name "
                f"(e.g. Chrome, Slack) or a path under your home directory."
            ),
        }

    try:
        if os.name == "nt":
            if Path(launch_target).suffix.lower() in {".exe", ".lnk"} and Path(launch_target).exists():
                os.startfile(launch_target)  # type: ignore[attr-defined]
            elif shutil.which(launch_target):
                subprocess.Popen([launch_target], shell=False)
            else:
                subprocess.Popen(["cmd", "/c", "start", "", launch_target], shell=False)
        elif platform.system() == "Darwin":
            subprocess.Popen(
                ["open", "-a", launch_target]
                if not Path(launch_target).exists()
                else ["open", launch_target]
            )
        else:
            subprocess.Popen(
                ["xdg-open", launch_target] if Path(launch_target).exists() else [launch_target]
            )
        return {"ok": True, "data": {"opened": launch_target}}
    except Exception as exc:
        logger.exception("open_app failed")
        return {"ok": False, "error": str(exc)}


def close_app(parameters: dict) -> dict:
    """
    Close a running application by name.

    Parameters:
        app_name: Human-readable app name (e.g. "WhatsApp", "Chrome", "Spotify").
    """
    logger.debug("[action] close_app called args=%r", parameters)
    app_name = str(parameters.get("app_name", "")).strip()
    if not app_name:
        return {"ok": False, "error": "app_name is required"}

    osn = platform.system()
    key = app_name.lower().replace(" ", "")
    procs = _APP_PROCESS_MAP.get(key, [])

    # If not in the map, derive a best-guess process name
    if not procs:
        if osn == "Windows":
            procs = [app_name + ".exe", app_name]
        else:
            procs = [app_name]

    killed: list[str] = []
    errors: list[str] = []

    for proc in procs:
        try:
            if osn == "Windows":
                r = subprocess.run(
                    ["taskkill", "/F", "/IM", proc],
                    capture_output=True, check=False, timeout=8,
                )
                if r.returncode == 0:
                    killed.append(proc)
            elif osn == "Darwin":
                r = subprocess.run(
                    ["osascript", "-e", f'quit app "{proc}"'],
                    capture_output=True, check=False, timeout=8,
                )
                if r.returncode == 0:
                    killed.append(proc)
            else:
                r = subprocess.run(
                    ["pkill", "-f", proc],
                    capture_output=True, check=False, timeout=8,
                )
                if r.returncode == 0:
                    killed.append(proc)
        except Exception as exc:
            errors.append(f"{proc}: {exc}")

    if killed:
        return {"ok": True, "data": {"closed": killed}}
    if errors:
        return {"ok": False, "error": "; ".join(errors)}
    return {"ok": False, "error": f"No running process found for '{app_name}'"}
