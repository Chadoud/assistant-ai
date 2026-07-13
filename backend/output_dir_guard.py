"""
Validates output_dir before any sort job writes files to it.

An end-user downloads and runs this app on their own machine. The backend
accepts output_dir as a string from the renderer — we must not allow it to
point at OS-critical directories even if the X-App-Token is valid, because the
renderer is an attack surface (malicious HTML file, XSS, compromised renderer).

Strategy: allowlist the user's home tree and reject a small, explicit set of
system paths. We do NOT try to enumerate every system path — instead we reject
anything that is or lives under the explicit OS roots that would be catastrophic
to sort files into.
"""

from __future__ import annotations

import os
import pathlib
import sys


def _system_blocked_roots() -> list[pathlib.Path]:
    """
    Returns absolute paths that must never be used as output_dir (or a sub-path thereof).
    Kept deliberately minimal — we only block paths where a rogue move/copy
    could corrupt the operating system or critical system state.
    """
    blocked: list[pathlib.Path] = []

    if sys.platform == "win32":
        # C:\Windows, C:\Windows\System32, etc.
        win_root = os.environ.get("SystemRoot", "C:\\Windows")
        blocked.append(pathlib.Path(win_root))

        prog = os.environ.get("ProgramFiles", "C:\\Program Files")
        blocked.append(pathlib.Path(prog))

        prog86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
        if prog86:
            blocked.append(pathlib.Path(prog86))

        prog_data = os.environ.get("ProgramData", "C:\\ProgramData")
        blocked.append(pathlib.Path(prog_data))
    else:
        # Unix system directories
        for p in ("/", "/bin", "/sbin", "/usr", "/etc", "/var", "/lib",
                  "/lib64", "/opt", "/boot", "/dev", "/proc", "/sys",
                  "/run", "/tmp"):
            blocked.append(pathlib.Path(p))

        # macOS
        for p in ("/System", "/Applications", "/Library", "/private"):
            blocked.append(pathlib.Path(p))

    home = pathlib.Path.home()
    # Critical dot-dirs under home — private keys, GPG, credentials
    for name in (".ssh", ".gnupg", ".aws", ".config/google-chrome",
                 ".mozilla", "Library/Keychains"):
        blocked.append(home / name)

    return blocked


def _resolve_safe(raw: str) -> pathlib.Path | None:
    try:
        return pathlib.Path(raw).expanduser().resolve()
    except (OSError, ValueError, RuntimeError):
        return None


def is_safe_output_dir(output_dir: str) -> tuple[bool, str]:
    """
    Returns (ok, reason).
    ``ok`` is True when output_dir is acceptable as a sort destination.
    ``reason`` is a human-readable explanation when ok is False.
    """
    if not output_dir or not output_dir.strip():
        return False, "Output directory must not be empty."

    resolved = _resolve_safe(output_dir)
    if resolved is None:
        return False, "Output directory path is invalid."

    for root in _system_blocked_roots():
        root_r = _resolve_safe(str(root))
        if root_r is None:
            continue
        # The filesystem root ("/") is an ancestor of every absolute path —
        # prefix-matching it would reject all destinations on Unix. Block only
        # sorting into the root itself.
        if root_r == root_r.parent:
            if resolved == root_r:
                return False, (
                    f"Output directory '{resolved}' is the filesystem root "
                    f"and cannot be used as a sort destination."
                )
            continue
        try:
            if resolved == root_r or resolved.is_relative_to(root_r):
                return False, (
                    f"Output directory '{resolved}' is inside a system-protected path "
                    f"and cannot be used as a sort destination."
                )
        except (OSError, ValueError, RuntimeError):
            continue

    return True, ""


def assert_safe_output_dir(output_dir: str) -> None:
    """
    Raise ``ValueError`` with a descriptive message when output_dir is unsafe.
    Call this at the boundary — before any job record is created.
    """
    ok, reason = is_safe_output_dir(output_dir)
    if not ok:
        raise ValueError(reason)
