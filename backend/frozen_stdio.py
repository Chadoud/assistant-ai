"""Stdio helpers for PyInstaller windowed (console=False) executables."""

from __future__ import annotations

import os
import sys


def ensure_stdio_streams() -> None:
    """
    PyInstaller windowed builds on Windows leave stdout/stderr as None.
    Uvicorn's DefaultFormatter calls ``sys.stderr.isatty()`` during startup and
    crashes when stderr is missing (e.g. Norton CyberCapture running backend.exe alone).
    """
    if sys.stdout is not None and sys.stderr is not None:
        return
    sink = open(os.devnull, "w", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = sink
    if sys.stderr is None:
        sys.stderr = sink
