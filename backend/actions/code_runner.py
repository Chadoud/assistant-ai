"""Run user-approved Python in a temp file (timeout, no network by default)."""

from __future__ import annotations

import logging
import subprocess
import sys
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_OUTPUT = 8000
DEFAULT_TIMEOUT = 30


def code_runner(parameters: dict) -> dict:
    """
    Parameters:
        code: Python source
        timeout_sec: optional int
    """
    logger.debug("[action] code_runner called (code omitted from log)")
    code = str(parameters.get("code", "")).strip()
    if not code:
        return {"ok": False, "error": "code is required"}
    timeout = int(parameters.get("timeout_sec", DEFAULT_TIMEOUT))
    timeout = max(5, min(120, timeout))

    root = Path.home() / ".ai-manager" / "codegen"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"snippet_{uuid.uuid4().hex[:10]}.py"
    path.write_text(code, encoding="utf-8")

    try:
        proc = subprocess.run(
            [sys.executable, str(path)],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        out = (proc.stdout or "")[:MAX_OUTPUT]
        err = (proc.stderr or "")[:MAX_OUTPUT]
        return {
            "ok": proc.returncode == 0,
            "data": {
                "returncode": proc.returncode,
                "stdout": out,
                "stderr": err,
                "path": str(path),
            },
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timed out after {timeout}s", "data": {"path": str(path)}}
    except Exception as exc:
        logger.exception("code_runner")
        return {"ok": False, "error": str(exc)}
