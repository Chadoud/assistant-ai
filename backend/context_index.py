"""
Persistent cross-run folder context index.

Stores lightweight per-folder context so future runs can reuse existing folders
when incoming files match previous topics.

Learning loop: each successful apply records the destination folder plus an excerpt
(JobService.update_with_classification). User reassignments update the same index via
reassign_file (see main.py). Corrections are the main way to fix long-tail taxonomy
and wording without adding code rules.
"""

from __future__ import annotations

import json
import pathlib
import re
import threading
import time
from typing import Optional

from constants import APP_STATE_DIR
from signal_quality import file_allowed_on_brain_map, folder_allowed_on_brain_map

DEFAULT_CONTEXT_PATH = APP_STATE_DIR / "context_index.json"
MAX_FILES_PER_FOLDER = 500
MAX_SAMPLE_LEN = 320
MAX_SAMPLES_PER_FOLDER = 6
MAX_KEYWORDS_PER_FOLDER = 12

_STOPWORDS = {
    "the",
    "and",
    "for",
    "that",
    "this",
    "with",
    "from",
    "your",
    "you",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "into",
    "about",
    "will",
    "shall",
    "not",
    "but",
    "can",
    "all",
    "any",
    "our",
    "their",
    "its",
    "also",
}


def _clean_excerpt(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if len(cleaned) > MAX_SAMPLE_LEN:
        cleaned = cleaned[:MAX_SAMPLE_LEN].rstrip()
    return cleaned


# OS-generated bookkeeping files carry no meaning for the user and only clutter
# the brain map (e.g. macOS .DS_Store, Windows Thumbs.db). Hidden from the map.
_SYSTEM_JUNK_NAMES = {
    ".ds_store",
    "thumbs.db",
    "desktop.ini",
    ".localized",
    "icon\r",
}


def _is_system_junk_file(name: str) -> bool:
    lowered = (name or "").strip().lower()
    if not lowered:
        return False
    if lowered in _SYSTEM_JUNK_NAMES:
        return True
    # AppleDouble resource forks (._foo) and Spotlight/Trash metadata dirs.
    return lowered.startswith("._") or lowered.startswith(".spotlight-") or lowered in {
        ".trashes",
        ".fseventsd",
        ".apdisk",
    }


def _extract_keywords(samples: list[str]) -> list[str]:
    freq: dict[str, int] = {}
    for sample in samples:
        for token in re.findall(r"[A-Za-z][A-Za-z0-9_\-]{2,}", sample.lower()):
            if token in _STOPWORDS:
                continue
            freq[token] = freq.get(token, 0) + 1
    ranked = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
    return [k for k, _ in ranked[:MAX_KEYWORDS_PER_FOLDER]]


class ContextIndex:
    def __init__(self, path: Optional[str] = None):
        self.path = pathlib.Path(path) if path else DEFAULT_CONTEXT_PATH
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._data: dict = {"version": 1, "folders": {}}
        self.load()

    def load(self) -> None:
        with self._lock:
            if not self.path.exists():
                self._data = {"version": 1, "folders": {}}
                return
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict) and isinstance(loaded.get("folders"), dict):
                    self._data = loaded
                else:
                    self._data = {"version": 1, "folders": {}}
            except (json.JSONDecodeError, OSError):
                self._data = {"version": 1, "folders": {}}

    def save(self) -> None:
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        with self._lock:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._data, f, indent=2, ensure_ascii=False)
                f.flush()
            tmp.replace(self.path)

    def _ensure_folder(self, folder_name: str) -> dict:
        folders = self._data.setdefault("folders", {})
        folder = folders.get(folder_name)
        if not isinstance(folder, dict):
            folder = {
                "file_count": 0,
                "updated_at": 0.0,
                "samples": [],
                "keywords": [],
                "files": {},
                "profile": "",
            }
            folders[folder_name] = folder
        folder.setdefault("samples", [])
        folder.setdefault("keywords", [])
        folder.setdefault("files", {})
        folder.setdefault("file_count", 0)
        folder.setdefault("updated_at", 0.0)
        folder.setdefault("profile", "")
        return folder

    def get_folder_contexts(self) -> dict[str, dict]:
        with self._lock:
            out: dict[str, dict] = {}
            for name, folder in self._data.get("folders", {}).items():
                if not isinstance(folder, dict):
                    continue
                samples = folder.get("samples", [])[:MAX_SAMPLES_PER_FOLDER]
                keywords = folder.get("keywords", [])[:MAX_KEYWORDS_PER_FOLDER]
                prof = folder.get("profile")
                profile_str = str(prof).strip()[:600] if isinstance(prof, str) else ""
                out[name] = {
                    "file_count": int(folder.get("file_count", 0)),
                    "samples": list(samples),
                    "keywords": list(keywords),
                    "profile": profile_str,
                    "updated_at": float(folder.get("updated_at", 0.0)),
                }
            return out

    def folder_names(self) -> list[str]:
        with self._lock:
            return list(self._data.get("folders", {}).keys())

    def list_brain_map_files(
        self,
        *,
        max_folders: int = 35,
        max_files_per_folder: int = 15,
    ) -> list[dict]:
        """
        Export folder/file excerpts for the second-brain graph (read-only).

        Sorted by most recently updated folders first; within each folder, files
        are newest-first and capped so the frontend force layout stays bounded.
        """
        with self._lock:
            raw: list[tuple[float, str, dict]] = []
            for name, folder in self._data.get("folders", {}).items():
                if not isinstance(folder, dict):
                    continue
                raw.append((float(folder.get("updated_at", 0.0)), name, folder))
            raw.sort(key=lambda t: t[0], reverse=True)

            out: list[dict] = []
            for _, name, folder in raw:
                if len(out) >= max_folders:
                    break
                if not folder_allowed_on_brain_map(
                    name,
                    profile=str(folder.get("profile") or ""),
                ):
                    continue
                files = folder.get("files", {})
                if not isinstance(files, dict) or not files:
                    continue
                visible = [
                    (path, rec)
                    for path, rec in files.items()
                    if not _is_system_junk_file(pathlib.Path(path).name)
                    and file_allowed_on_brain_map(
                        name=pathlib.Path(path).name,
                        excerpt=str(rec.get("excerpt", "") or "") if isinstance(rec, dict) else "",
                    )
                ]
                if not visible:
                    continue
                items = sorted(
                    visible,
                    key=lambda kv: float(kv[1].get("updated_at", 0.0) if isinstance(kv[1], dict) else 0.0),
                    reverse=True,
                )[:max_files_per_folder]
                file_rows = []
                for path, rec in items:
                    if not isinstance(rec, dict):
                        continue
                    excerpt = _clean_excerpt(str(rec.get("excerpt", "") or ""))
                    file_rows.append(
                        {
                            "path": path,
                            "name": pathlib.Path(path).name,
                            "excerpt": excerpt,
                            "updated_at": float(rec.get("updated_at", 0.0)),
                        }
                    )
                if not file_rows:
                    continue
                prof = folder.get("profile")
                profile_str = str(prof).strip()[:600] if isinstance(prof, str) else ""
                out.append(
                    {
                        "folder_name": name,
                        "file_count": len(visible),
                        "profile": profile_str,
                        "keywords": list(folder.get("keywords", []))[:MAX_KEYWORDS_PER_FOLDER],
                        "updated_at": float(folder.get("updated_at", 0.0)),
                        "files": file_rows,
                    }
                )
            return out

    def set_folder_profile(self, folder_name: str, profile: str) -> None:
        """Persist a short human-written description for embeddings / UI (optional)."""
        name = (folder_name or "").strip()
        if not name:
            return
        with self._lock:
            folder = self._ensure_folder(name)
            folder["profile"] = str(profile or "")[:800]
        self.save()

    def retrieve_related_folders(self, query_tokens: list[str], *, limit: int = 8) -> list[dict]:
        """
        Return folder candidates ranked by keyword/sample token overlap.
        Experimental — not currently wired to an HTTP endpoint.
        """
        q = {t.lower() for t in query_tokens if isinstance(t, str) and t.strip()}
        if not q:
            return []
        out: list[dict] = []
        with self._lock:
            for name, folder in self._data.get("folders", {}).items():
                if not isinstance(folder, dict):
                    continue
                kw = {str(k).lower() for k in folder.get("keywords", []) if isinstance(k, str)}
                samples = " ".join(str(s) for s in folder.get("samples", []) if isinstance(s, str))
                sample_tokens = {t.lower() for t in re.findall(r"[A-Za-z][A-Za-z0-9_\-]{2,}", samples)}
                overlap = len(q & (kw | sample_tokens))
                if overlap <= 0:
                    continue
                denom = max(1, len(q))
                out.append(
                    {
                        "folder_name": name,
                        "score": overlap / denom,
                        "file_count": int(folder.get("file_count", 0)),
                    }
                )
        out.sort(key=lambda x: (float(x["score"]), int(x["file_count"])), reverse=True)
        return out[:limit]

    def update_with_classification(self, folder_name: str, file_excerpt: str, dest_path: str) -> None:
        now = time.time()
        clean_excerpt = _clean_excerpt(file_excerpt)
        with self._lock:
            folder = self._ensure_folder(folder_name)
            files = folder["files"]
            if not isinstance(files, dict):
                files = {}
                folder["files"] = files

            existing = files.get(dest_path)
            if not isinstance(existing, dict):
                if len(files) >= MAX_FILES_PER_FOLDER:
                    # Drop oldest record to bound size.
                    oldest_key = min(
                        files.keys(),
                        key=lambda k: float(files.get(k, {}).get("updated_at", 0.0)),
                    )
                    files.pop(oldest_key, None)
                files[dest_path] = {"excerpt": clean_excerpt, "updated_at": now}
            else:
                existing["excerpt"] = clean_excerpt or existing.get("excerpt", "")
                existing["updated_at"] = now

            self._recompute_folder(folder)

    def remove_file(self, folder_name: str, dest_path: str) -> None:
        with self._lock:
            folders = self._data.get("folders", {})
            folder = folders.get(folder_name)
            if not isinstance(folder, dict):
                return
            files = folder.get("files", {})
            if isinstance(files, dict):
                files.pop(dest_path, None)
            self._recompute_folder(folder)
            if folder.get("file_count", 0) <= 0:
                folders.pop(folder_name, None)

    def reassign_file(self, old_folder: str, new_folder: str, old_dest: str, new_dest: str) -> None:
        with self._lock:
            excerpt = ""
            old = self._data.get("folders", {}).get(old_folder)
            if isinstance(old, dict):
                files = old.get("files", {})
                if isinstance(files, dict):
                    rec = files.pop(old_dest, None)
                    if isinstance(rec, dict):
                        excerpt = str(rec.get("excerpt", "") or "")
                self._recompute_folder(old)
                if old.get("file_count", 0) <= 0:
                    self._data.get("folders", {}).pop(old_folder, None)

            target = self._ensure_folder(new_folder)
            files = target.get("files", {})
            if not isinstance(files, dict):
                files = {}
                target["files"] = files
            files[new_dest] = {"excerpt": _clean_excerpt(excerpt), "updated_at": time.time()}
            self._recompute_folder(target)

    def _recompute_folder(self, folder: dict) -> None:
        files = folder.get("files", {})
        if not isinstance(files, dict):
            folder["files"] = {}
            files = {}

        folder["file_count"] = len(files)
        folder["updated_at"] = time.time()

        samples: list[str] = []
        items = sorted(
            files.values(),
            key=lambda x: float(x.get("updated_at", 0.0)),
            reverse=True,
        )
        for rec in items:
            excerpt = _clean_excerpt(str(rec.get("excerpt", "")))
            if excerpt:
                samples.append(excerpt)
            if len(samples) >= MAX_SAMPLES_PER_FOLDER:
                break

        folder["samples"] = samples
        folder["keywords"] = _extract_keywords(samples)
