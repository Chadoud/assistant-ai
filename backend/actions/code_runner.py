"""Run user-approved Python in a temp file under ~/.ai-manager/codegen.

Residual risk (honest):
- No OS-level network sandbox: snippets can open sockets if the user approves execution.
- Same Python interpreter as the backend; stdlib and installed packages are available.
- Scripts are confined to a resolved path under the codegen root; path escapes are rejected.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

MAX_OUTPUT = 8000
DEFAULT_TIMEOUT = 30
CODEGEN_ROOT = Path.home() / ".ai-manager" / "codegen"


def _resolve_under_codegen(path: Path) -> Path | None:
    try:
        resolved = path.expanduser().resolve()
        root = CODEGEN_ROOT.resolve()
        if resolved.is_relative_to(root):
            return resolved
    except (ValueError, OSError):
        pass
    return None


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

    CODEGEN_ROOT.mkdir(parents=True, exist_ok=True)
    path = CODEGEN_ROOT / f"snippet_{uuid.uuid4().hex[:10]}.py"
    if _resolve_under_codegen(path) is None:
        return {"ok": False, "error": "script path must stay under the codegen directory"}

    path.write_text(code, encoding="utf-8")
    resolved = _resolve_under_codegen(path)
    if resolved is None:
        return {"ok": False, "error": "script path must stay under the codegen directory"}

    try:
        proc = subprocess.run(
            [sys.executable, str(resolved)],
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
            cwd=str(CODEGEN_ROOT.resolve()),
        )
        out = (proc.stdout or "")[:MAX_OUTPUT]
        err = (proc.stderr or "")[:MAX_OUTPUT]
        return {
            "ok": proc.returncode == 0,
            "data": {
                "returncode": proc.returncode,
                "stdout": out,
                "stderr": err,
                "path": str(resolved),
            },
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Timed out after {timeout}s", "data": {"path": str(resolved)}}
    except Exception as exc:
        logger.exception("code_runner")
        return {"ok": False, "error": str(exc)}
