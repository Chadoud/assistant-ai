"""
Simple disk-backed checkpoint store for long-running jobs.
"""

from __future__ import annotations

import json
import os
import pathlib
import tempfile
import threading
import time
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
        """Atomically persist jobs; tolerate missing parent / multi-process races."""
        with self._lock:
            last_err: OSError | None = None
            for attempt in range(3):
                self.path.parent.mkdir(parents=True, exist_ok=True)
                fd, tmp_name = tempfile.mkstemp(
                    prefix=f"{self.path.name}.",
                    suffix=".tmp",
                    dir=str(self.path.parent),
                )
                tmp_path = pathlib.Path(tmp_name)
                try:
                    with os.fdopen(fd, "w", encoding="utf-8") as f:
                        json.dump(jobs, f, indent=2, ensure_ascii=False)
                        f.flush()
                        os.fsync(f.fileno())
                    os.replace(tmp_path, self.path)
                    return
                except FileNotFoundError as e:
                    last_err = e
                    try:
                        tmp_path.unlink(missing_ok=True)
                    except OSError:
                        pass
                    time.sleep(0.05 * (attempt + 1))
                except Exception:
                    try:
                        tmp_path.unlink(missing_ok=True)
                    except OSError:
                        pass
                    raise
            if last_err is not None:
                raise last_err
