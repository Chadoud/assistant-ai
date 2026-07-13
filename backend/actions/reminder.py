"""Schedule a one-off OS reminder (Windows Task Scheduler, macOS launchd)."""

from __future__ import annotations

import logging
import platform
import plistlib
import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


def _write_notify_script(root: Path, script_id: str, message: str) -> Path:
    """Write the small cross-platform script that shows the reminder popup."""
    script_path = root / f"remind_{script_id}.py"
    script_body = f"""# -*- coding: utf-8 -*-
import subprocess
import sys

msg = {message!r}
try:
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, msg, "Reminder", 0x40)
    elif sys.platform == "darwin":
        subprocess.run(["osascript", "-e", f'display notification "{{msg}}" with title "Reminder"'], check=False)
    else:
        subprocess.run(["notify-send", "Reminder", msg], check=False)
except Exception as e:
    print(e)
"""
    script_path.write_text(script_body, encoding="utf-8")
    return script_path


def _schedule_windows(script_path: Path, when: datetime, script_id: str, py_exe: str) -> dict:
    task_name = f"AIManagerRem_{script_id}"
    subprocess.run(
        [
            "schtasks", "/Create", "/F",
            "/TN", task_name,
            "/TR", f'"{py_exe}" "{script_path}"',
            "/SC", "ONCE",
            "/ST", when.strftime("%H:%M"),
            "/SD", when.strftime("%m/%d/%Y"),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return {"ok": True, "data": {"task": task_name, "when": when.isoformat(), "script": str(script_path)}}


def _schedule_macos(script_path: Path, when: datetime, script_id: str, py_exe: str) -> dict:
    """One-shot LaunchAgent: fires at the calendar date, then unloads and removes itself."""
    label = f"com.exosites.aimanager.reminder.{script_id}"
    agents_dir = Path.home() / "Library" / "LaunchAgents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    plist_path = agents_dir / f"{label}.plist"

    # The agent runs the notify script, removes its own files, then boots itself
    # out so the yearly StartCalendarInterval repeat never fires again. bootout
    # must come last — it terminates this shell.
    cleanup_cmd = (
        f'"{py_exe}" "{script_path}"; '
        f'/bin/rm -f "{plist_path}" "{script_path}"; '
        f'/bin/launchctl bootout gui/$(id -u)/{label} 2>/dev/null'
    )
    plist_path.write_bytes(
        plistlib.dumps(
            {
                "Label": label,
                "ProgramArguments": ["/bin/sh", "-c", cleanup_cmd],
                "StartCalendarInterval": {
                    "Month": when.month,
                    "Day": when.day,
                    "Hour": when.hour,
                    "Minute": when.minute,
                },
                "RunAtLoad": False,
            }
        )
    )
    load = subprocess.run(
        ["launchctl", "load", str(plist_path)],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if load.returncode != 0:
        plist_path.unlink(missing_ok=True)
        raise RuntimeError(load.stderr.strip() or "launchctl load failed")
    return {"ok": True, "data": {"task": label, "when": when.isoformat(), "script": str(script_path)}}


def schedule_reminder(parameters: dict) -> dict:
    """
    Parameters:
        message: notification body
        date: YYYY-MM-DD
        time: HH:MM (24h local)
    """
    logger.debug("[action] schedule_reminder called args=%r", parameters)
    message = str(parameters.get("message", "Reminder")).strip()
    date_s = str(parameters.get("date", "")).strip()
    time_s = str(parameters.get("time", "")).strip()
    if not date_s or not time_s:
        return {"ok": False, "error": "date and time are required (YYYY-MM-DD, HH:MM)"}

    try:
        when = datetime.strptime(f"{date_s} {time_s}", "%Y-%m-%d %H:%M")
    except ValueError:
        return {"ok": False, "error": "Invalid date/time format"}

    if when <= datetime.now():
        return {"ok": False, "error": "Reminder time must be in the future"}

    root = Path.home() / ".ai-manager" / "reminders"
    root.mkdir(parents=True, exist_ok=True)
    script_id = str(uuid.uuid4())[:8]
    script_path = _write_notify_script(root, script_id, message)

    py_exe = shutil.which("python") or shutil.which("python3") or "python"
    system = platform.system()

    try:
        if system == "Windows":
            return _schedule_windows(script_path, when, script_id, py_exe)
        if system == "Darwin":
            return _schedule_macos(script_path, when, script_id, py_exe)
        return {
            "ok": False,
            "error": (
                "Automatic reminder scheduling is not supported on this OS. "
                f"A notification script was saved to {script_path} — run it at the desired time "
                "(e.g. via cron)."
            ),
        }
    except Exception as exc:
        logger.exception("reminder")
        return {
            "ok": False,
            "error": (
                f"Could not schedule the reminder: {exc}. "
                f"A notification script was saved to {script_path}; run it manually at {when.isoformat()}."
            ),
        }
