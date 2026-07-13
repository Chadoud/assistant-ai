"""Launch and close desktop applications (platform-specific)."""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

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


def open_app(parameters: dict) -> dict:
    """
    Open an application by path or known name.

    Parameters:
        target: Executable path, .app bundle path (macOS), or app name on PATH.
    """
    logger.debug("[action] open_app called args=%r", parameters)
    target = str(parameters.get("target", "")).strip()
    if not target:
        return {"ok": False, "error": "target is required"}

    try:
        if os.name == "nt":
            if Path(target).suffix.lower() in {".exe", ".lnk"} and Path(target).exists():
                os.startfile(target)  # type: ignore[attr-defined]
            elif shutil.which(target):
                subprocess.Popen([target], shell=False)
            else:
                subprocess.Popen(["cmd", "/c", "start", "", target], shell=False)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", "-a", target] if not Path(target).exists() else ["open", target])
        else:
            subprocess.Popen(["xdg-open", target] if Path(target).exists() else [target])
        return {"ok": True, "data": {"opened": target}}
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
