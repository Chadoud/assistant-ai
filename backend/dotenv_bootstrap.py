"""
Load ``.env`` files before the rest of the app reads ``os.environ``.

Fills only keys that are unset or blank so Electron / shell can still override
with real values. Searches several locations because ``__file__`` for a frozen
backend binary points at a temp extract dir, not the folder that holds your
``backend/.env`` from development.
"""

from __future__ import annotations

import os
import pathlib
import sys
from typing import Iterable

# OAuth client id/secret: Electron (or a shell) may pre-set placeholders on the child process.
# ``backend/.env`` must still win so Gmail setup matches what developers edit on disk.
_GMAIL_OAUTH_ENV_KEYS: frozenset[str] = frozenset(
    {
        "EXOSITES_GOOGLE_CLIENT_ID",
        "EXOSITES_GOOGLE_CLIENT_SECRET",
        "EXOSITES_GOOGLE_OAUTH_CLIENT_JSON",
    }
)

# Remote sort LLM: parent shell/Electron may inject stale ``http://IP:4000``; ``backend/.env`` wins.
_REMOTE_LLM_ENV_KEYS: frozenset[str] = frozenset(
    {
        "OLLAMA_MODE",
        "OLLAMA_HOST",
        "OLLAMA_BASE_URL",
        "OLLAMA_API_KEY",
        "EXOSITES_REMOTE_LLM",
        "EXOSITES_LLM_MAX_SLOTS",
        "EXOSITES_SORT_MAX_CONCURRENCY",
        "EXOSITES_SORT_QUEUE_URL",
        "EXOSITES_CLOUD_SORT_WORKER",
        "EXOSITES_CLOUD_SORT_WORKER_URL",
        "EXOSITES_SORT_SERVICE_MODE",
        "OLLAMA_REQUEST_TIMEOUT_S",
        "OLLAMA_MAX_RETRIES",
        "EXOSITES_SORT_CREDENTIALS_MANAGED",
    }
)


def _parse_env_file_loose(path: pathlib.Path) -> dict[str, str]:
    """
    Line-based KEY=value parse (tolerant of ``export ``, quotes, ``#`` comments, CRLF).

    Used alongside ``dotenv_values`` so Gmail OAuth keys still load if the library
    skips a line (encoding edge cases, unusual spacing).
    """
    out: dict[str, str] = {}
    try:
        raw_text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError):
        return out
    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.replace("\r", "").strip()
        v = v.strip()
        if not k:
            continue
        if "#" in v and not v.startswith('"'):
            v = v.split("#", 1)[0].strip()
        if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
            v = v[1:-1].strip()
        if v:
            out[k] = v
    return out


def dotenv_candidate_paths(main_file: str) -> list[pathlib.Path]:
    """
    Return ``.env`` paths to try, in order (first wins for each key).

    :param main_file: Pass ``__file__`` from ``main.py``.
    """
    backend_dir = pathlib.Path(main_file).resolve().parent
    repo_root = backend_dir.parent
    paths: list[pathlib.Path] = [
        backend_dir / ".env",
        repo_root / ".env",
    ]
    # Electron sets this to dev ``backend/`` or packaged ``resources/`` so ``.env`` can live next to the backend binary.
    resource_dir = (os.environ.get("EXOSITES_BACKEND_RESOURCE_DIR") or "").strip()
    if resource_dir:
        paths.append(pathlib.Path(resource_dir) / ".env")
    # Electron sets this for the packaged backend; project ``backend/.env`` is often not on disk next to the binary.
    user_data = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if user_data:
        paths.append(pathlib.Path(user_data) / ".env")
    if getattr(sys, "frozen", False):
        paths.append(pathlib.Path(sys.executable).resolve().parent / ".env")
    paths.append(pathlib.Path.home() / ".ai-file-sorter" / ".env")

    seen: set[pathlib.Path] = set()
    unique: list[pathlib.Path] = []
    for p in paths:
        key = p.resolve()
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique


def apply_dotenv_files(paths: Iterable[pathlib.Path]) -> None:
    """
    Merge variables from each existing ``.env`` file into ``os.environ``.

    Skips keys that are already set to a non-blank value. Skips blank values
    from files.
    """
    try:
        from dotenv import dotenv_values
    except ImportError:
        return

    for path in paths:
        if not path.is_file():
            continue
        data = dotenv_values(str(path), encoding="utf-8-sig")
        for k, v in data.items():
            if not k:
                continue
            k = str(k).replace("\r", "").lstrip("\ufeff").strip()
            if v is None:
                continue
            raw = str(v)
            if not raw.strip():
                continue
            cur = os.environ.get(k)
            if cur is None or not str(cur).strip():
                os.environ[k] = raw


def _apply_env_keys_first_wins_from_dotenv_files(main_file: str, keys: frozenset[str]) -> None:
    """
    Set env vars from discovered ``.env`` files (first file that defines each key wins).

    Used when a parent process injects placeholders/stale values so ``backend/.env``
    still applies for keys that must match developer or packaged config on disk.
    """
    merged: dict[str, str] = {}
    dotenv_values = None
    try:
        from dotenv import dotenv_values as _dv

        dotenv_values = _dv
    except ImportError:
        pass

    for path in dotenv_candidate_paths(main_file):
        if not path.is_file():
            continue
        loose = _parse_env_file_loose(path)
        data: dict[str, str | None] = {}
        if dotenv_values is not None:
            try:
                raw_data = dict(dotenv_values(str(path), encoding="utf-8-sig"))
                data = {
                    str(k).replace("\r", "").lstrip("\ufeff").strip(): v
                    for k, v in raw_data.items()
                    if k is not None and str(k).strip()
                }
            except OSError:
                data = {}
        for key in keys:
            if key in merged:
                continue
            raw = ""
            v = data.get(key)
            if v is not None and str(v).strip():
                raw = str(v).strip()
            elif key in loose and loose[key].strip():
                raw = loose[key].strip()
            if raw:
                merged[key] = raw
    for key, raw in merged.items():
        os.environ[key] = raw


def _apply_gmail_oauth_env_from_dotenv_files_first_wins(main_file: str) -> None:
    _apply_env_keys_first_wins_from_dotenv_files(main_file, _GMAIL_OAUTH_ENV_KEYS)


def _apply_remote_llm_env_from_dotenv_files_first_wins(main_file: str) -> None:
    keys = set(_REMOTE_LLM_ENV_KEYS)
    managed = (os.environ.get("EXOSITES_SORT_CREDENTIALS_MANAGED") or "").strip().lower()
    if managed in ("1", "true", "yes", "on"):
        # Electron injects a short-lived virtual key — never let ``backend/.env`` stomp it.
        keys.discard("OLLAMA_API_KEY")
    _apply_env_keys_first_wins_from_dotenv_files(main_file, frozenset(keys))


def refresh_gmail_oauth_env_from_dotenv(main_file: str) -> None:
    """
    Re-read Gmail OAuth keys from ``.env`` files (cheap; safe to call on each ``/gmail/status``).

    Lets users fix ``backend/.env`` without restarting the whole app, as long as the
    backend process is still running.
    """
    _apply_gmail_oauth_env_from_dotenv_files_first_wins(main_file)


def writable_env_file_path() -> pathlib.Path:
    """
    Path for persisting runtime secrets (``POST /ai/set-key``).

    Packaged Electron apps must write under ``EXOSITES_USER_DATA`` — the PyInstaller
    extract dir and bundled ``resources/`` are often read-only.
    """
    user_data = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if user_data:
        return pathlib.Path(user_data) / ".env"
    if getattr(sys, "frozen", False):
        return pathlib.Path(sys.executable).resolve().parent / ".env"
    return pathlib.Path(__file__).resolve().parent / ".env"


def load_dotenv_early(*, main_file: str) -> None:
    """Load candidate ``.env`` files for this process."""
    paths = dotenv_candidate_paths(main_file)
    apply_dotenv_files(paths)
    refresh_gmail_oauth_env_from_dotenv(main_file)
    _apply_remote_llm_env_from_dotenv_files_first_wins(main_file)
