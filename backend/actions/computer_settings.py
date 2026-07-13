"""Low-risk system tweaks (brightness best-effort per OS)."""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
from typing import Any

logger = logging.getLogger(__name__)


def computer_settings(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        action: brightness
        level: 0-100 for brightness (best-effort)
    """
    logger.debug("[action] computer_settings called args=%r", parameters)
    action = str(parameters.get("action", "")).strip().lower()
    if action != "brightness":
        return {
            "ok": False,
            "error": "Unsupported action; use action=brightness with level 0-100",
        }

    level = max(0, min(100, int(parameters.get("level", 50))))

    try:
        system = platform.system()
        if system == "Darwin":
            # No public macOS API for display brightness from a background process;
            # the open-source `brightness` CLI (brew install brightness) is the
            # standard bridge for built-in displays.
            if shutil.which("brightness"):
                r = subprocess.run(
                    ["brightness", str(level / 100)],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if r.returncode == 0:
                    return {"ok": True, "data": {"brightness": level}}
                return {"ok": False, "error": r.stderr.strip() or "brightness CLI failed"}
            return {
                "ok": False,
                "error": (
                    "macOS brightness needs the 'brightness' CLI (brew install brightness); "
                    "otherwise use System Settings or the keyboard keys"
                ),
            }

        if system == "Linux":
            r = subprocess.run(
                ["brightnessctl", "set", f"{level}%"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if r.returncode == 0:
                return {"ok": True, "data": {"brightness": level}}
            return {"ok": False, "error": r.stderr.strip() or "brightnessctl failed"}

        if os.name == "nt":
            ps = (
                "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods)"
                f".WmiSetBrightness(1,{level})"
            )
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True,
                text=True,
                timeout=8,
            )
            if r.returncode == 0:
                return {"ok": True, "data": {"brightness": level}}
            return {
                "ok": True,
                "data": {
                    "brightness": level,
                    "warning": "Windows brightness API may require admin or built-in display; "
                    + (r.stderr.strip() or r.stdout.strip() or "unknown"),
                },
            }

        return {"ok": False, "error": "Brightness control not available on this OS"}
    except FileNotFoundError:
        return {"ok": False, "error": "brightnessctl not installed (Linux)"}
    except Exception as exc:
        logger.exception("computer_settings")
        return {"ok": False, "error": str(exc)}
