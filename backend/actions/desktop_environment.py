"""Desktop wallpaper (best-effort; Windows primary)."""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _home() -> Path:
    return Path.home()


def _safe_under_home(p: str) -> Path | None:
    try:
        path = Path(p).expanduser().resolve()
        if path.is_relative_to(_home()) and path.is_file():
            return path
    except ValueError:
        pass
    return None


def desktop_environment(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        action: set_wallpaper
        path: image file under home (.jpg / .png / .bmp)
    """
    logger.debug("[action] desktop_environment called args=%r", parameters)
    action = str(parameters.get("action", "")).strip().lower()
    if action != "set_wallpaper":
        return {"ok": False, "error": "Unsupported action; use set_wallpaper with path"}

    raw = str(parameters.get("path", "")).strip()
    img = _safe_under_home(raw)
    if not img:
        return {"ok": False, "error": "path must be an image file under home"}

    suf = img.suffix.lower()
    if suf not in {".bmp", ".jpg", ".jpeg", ".png", ".gif"}:
        return {"ok": False, "error": "Use bmp, jpg, png, or gif"}

    path_str = str(img)

    try:
        if os.name == "nt":
            import ctypes

            CS = 20
            SPIF_UPDATEINIFILE = 0x01
            SPIF_SENDCHANGE = 0x02
            ok = ctypes.windll.user32.SystemParametersInfoW(
                CS,
                0,
                path_str,
                SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
            )
            if ok:
                return {"ok": True, "data": {"wallpaper": path_str}}
            return {"ok": False, "error": "SystemParametersInfoW rejected wallpaper path"}

        if platform.system() == "Darwin":
            subprocess.run(
                [
                    "osascript",
                    "-e",
                    f'tell application "System Events" to tell every desktop to set picture to POSIX file "{path_str}"',
                ],
                check=False,
                capture_output=True,
                timeout=10,
            )
            return {"ok": True, "data": {"wallpaper": path_str, "note": "Best-effort AppleScript"}}

        # Linux: feh / gsettings
        if shutil.which("feh"):
            subprocess.Popen(["feh", "--bg-fill", path_str], close_fds=True)
            return {"ok": True, "data": {"wallpaper": path_str, "note": "feh --bg-fill"}}

        r = subprocess.run(
            [
                "gsettings",
                "set",
                "org.gnome.desktop.background",
                "picture-uri",
                f"file://{path_str}",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return {"ok": True, "data": {"wallpaper": path_str}}

        return {"ok": False, "error": "Install feh or use GNOME for wallpaper on Linux"}
    except Exception as exc:
        logger.exception("desktop_environment")
        return {"ok": False, "error": str(exc)}

