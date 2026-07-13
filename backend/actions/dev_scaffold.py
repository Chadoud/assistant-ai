"""Generate a tiny Python project under ~/.ai-manager/codegen and run main.py once."""

from __future__ import annotations

import logging
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 45
MAX_DESC = 2048

_DESCRIPTION_KEYS = (
    "description",
    "goal",
    "prompt",
    "requirements",
    "spec",
    "project_description",
    "user_request",
)


def _resolve_description(parameters: dict[str, Any]) -> str:
    """Accept common aliases voice models use instead of ``description``."""
    for key in _DESCRIPTION_KEYS:
        val = str(parameters.get(key, "")).strip()
        if val:
            return val[:MAX_DESC]
    return ""


def dev_scaffold_project(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters:
        description: what the mini project should do (shown in README)
        project_name: optional folder name slug
        timeout_sec: run timeout
    """
    logger.debug("[action] dev_scaffold_project called args=%r", parameters)
    description = _resolve_description(parameters)
    if not description:
        return {
            "ok": False,
            "error": (
                "description is required — pass the user's full project requirements "
                "in the description field (or goal/prompt)."
            ),
        }

    slug = str(parameters.get("project_name", "") or "").strip()
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in slug)[:48]
    if not slug:
        slug = f"project_{uuid.uuid4().hex[:8]}"

    timeout = int(parameters.get("timeout_sec", DEFAULT_TIMEOUT))
    timeout = max(10, min(120, timeout))

    root = Path.home() / ".ai-manager" / "codegen" / slug
    try:
        root.mkdir(parents=True, exist_ok=False)
    except FileExistsError:
        return {"ok": False, "error": f"Folder already exists: {root}"}

    main_py = f'''"""Auto-generated scaffold — edit freely."""

def main() -> None:
    """{description[:500].replace(chr(39), chr(34))}"""
    print("Hello from", __name__)
    # TODO: implement based on the goal below.
    print("Goal:", {description[:200]!r})


if __name__ == "__main__":
    main()
'''
    readme = f"# {slug}\n\n{description}\n\nRun: `python main.py`\n"
    req = ""

    try:
        (root / "main.py").write_text(main_py, encoding="utf-8")
        (root / "README.md").write_text(readme, encoding="utf-8")
        (root / "requirements.txt").write_text(req, encoding="utf-8")

        proc = subprocess.run(
            [sys.executable, str(root / "main.py")],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return {
            "ok": proc.returncode == 0,
            "data": {
                "project_dir": str(root),
                "returncode": proc.returncode,
                "stdout": (proc.stdout or "")[:6000],
                "stderr": (proc.stderr or "")[:6000],
            },
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Run timed out after {timeout}s", "data": {"project_dir": str(root)}}
    except Exception as exc:
        logger.exception("dev_scaffold_project")
        return {"ok": False, "error": str(exc)}
