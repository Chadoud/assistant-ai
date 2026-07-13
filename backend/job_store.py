"""
Simple disk-backed checkpoint store for long-running jobs.
"""

from __future__ import annotations

import json
import pathlib
import threading
from typing import Optional

from constants import APP_STATE_DIR

DEFAULT_JOBS_PATH = APP_STATE_DIR / "jobs.json"


class JobStore:
    def __init__(self, path: Optional[str] = None):
        self.path = pathlib.Path(path) if path else DEFAULT_JOBS_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def load(self) -> dict[str, dict]:
        with self._lock:
            if not self.path.exists():
                return {}
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
            except (OSError, json.JSONDecodeError):
                pass
            return {}

    def save(self, jobs: dict[str, dict]) -> None:
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with self._lock:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(jobs, f, indent=2, ensure_ascii=False)
                f.flush()
            tmp_path.replace(self.path)

