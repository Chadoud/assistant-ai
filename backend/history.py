"""
Persistent JSON-based undo log for file sort operations.
Each entry records one file sort so it can be reversed.
"""

import json
import pathlib
import threading
import time
from typing import Optional

from constants import APP_STATE_DIR

DEFAULT_LOG_PATH = APP_STATE_DIR / "history.json"


class HistoryLog:
    def __init__(self, log_path: Optional[str] = None):
        self.path = pathlib.Path(log_path) if log_path else DEFAULT_LOG_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._entries: list[dict] = []
        self._load()

    def _load(self):
        with self._lock:
            if self.path.exists():
                try:
                    with open(self.path, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                        self._entries = loaded if isinstance(loaded, list) else []
                except (json.JSONDecodeError, OSError):
                    self._entries = []

    def _save(self):
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with self._lock:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self._entries, f, indent=2, ensure_ascii=False)
                f.flush()
            tmp_path.replace(self.path)

    def record(
        self,
        source_path: str,
        dest_path: str,
        folder_name: str,
        mode: str,
        session_id: str,
    ) -> str:
        entry_id = f"{int(time.time() * 1000)}-{len(self._entries)}"
        entry = {
            "id": entry_id,
            "timestamp": time.time(),
            "source_path": source_path,
            "dest_path": dest_path,
            "folder_name": folder_name,
            "mode": mode,
            "session_id": session_id,
            "undone": False,
        }
        self._entries.append(entry)
        self._save()
        return entry_id

    def get_session_entries(self, session_id: str) -> list[dict]:
        return [e for e in self._entries if e["session_id"] == session_id and not e["undone"]]

    def get_all_undoable(self) -> list[dict]:
        """Return all entries that haven't been undone. Reserved for future bulk-undo UI."""
        return [e for e in self._entries if not e["undone"]]

    def mark_undone(self, entry_id: str):
        for entry in self._entries:
            if entry["id"] == entry_id:
                entry["undone"] = True
        self._save()

    def clear_session(self, session_id: str):
        """Mark all entries for a session as undone. Reserved for future session-reset feature."""
        for entry in self._entries:
            if entry["session_id"] == session_id:
                entry["undone"] = True
        self._save()

    def get_entry(self, entry_id: str) -> Optional[dict]:
        for entry in self._entries:
            if entry["id"] == entry_id:
                return entry
        return None

    def reassign_entry(self, entry_id: str, *, new_dest_path: str, new_folder_name: str) -> Optional[dict]:
        for entry in self._entries:
            if entry["id"] == entry_id:
                entry["dest_path"] = new_dest_path
                entry["folder_name"] = new_folder_name
                self._save()
                return entry
        return None

    def all_entries(self) -> list[dict]:
        return list(reversed(self._entries))
