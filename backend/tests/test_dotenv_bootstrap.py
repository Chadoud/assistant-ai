"""Tests for .env discovery and fill-missing merge."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

import dotenv_bootstrap
from dotenv_bootstrap import (
    _parse_env_file_loose,
    apply_dotenv_files,
    dotenv_candidate_paths,
    load_dotenv_early,
)


def test_apply_dotenv_skips_blank_and_respects_nonempty(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    a = tmp_path / "a.env"
    b = tmp_path / "b.env"
    a.write_text("FOO=from_a\nEMPTY=\n", encoding="utf-8")
    b.write_text("FOO=from_b\nBAR=bar\n", encoding="utf-8")

    monkeypatch.delenv("FOO", raising=False)
    monkeypatch.delenv("BAR", raising=False)
    apply_dotenv_files([a, b])
    assert os.environ["FOO"] == "from_a"
    assert os.environ["BAR"] == "bar"


def test_apply_dotenv_fills_when_parent_empty(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    p = tmp_path / "x.env"
    p.write_text("FOO=filled\n", encoding="utf-8")
    monkeypatch.setenv("FOO", "   ")
    apply_dotenv_files([p])
    assert os.environ["FOO"] == "filled"


def test_dotenv_candidate_paths_order(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    main_py = tmp_path / "backend" / "main.py"
    main_py.parent.mkdir(parents=True)
    main_py.touch()
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    paths = dotenv_candidate_paths(str(main_py))
    assert paths[0] == main_py.parent / ".env"
    assert paths[1] == main_py.parent.parent / ".env"
    assert paths[-1] == Path.home() / ".ai-file-sorter" / ".env"


def test_dotenv_candidate_paths_includes_backend_resource_dir_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    main_py = tmp_path / "backend" / "main.py"
    main_py.parent.mkdir(parents=True)
    main_py.touch()
    res = tmp_path / "resources"
    res.mkdir(parents=True)
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.setenv("EXOSITES_BACKEND_RESOURCE_DIR", str(res))
    paths = dotenv_candidate_paths(str(main_py))
    assert res / ".env" in paths


def test_dotenv_candidate_paths_includes_electron_user_data_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Packaged backend often has no project ``backend/.env`` on disk; Electron passes EXOSITES_USER_DATA."""
    main_py = tmp_path / "backend" / "main.py"
    main_py.parent.mkdir(parents=True)
    main_py.touch()
    ud = tmp_path / "electron-user-data"
    ud.mkdir(parents=True)
    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))
    paths = dotenv_candidate_paths(str(main_py))
    assert ud / ".env" in paths


def test_load_dotenv_early_gmail_keys_override_parent_env(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Electron may set placeholder Google client id; ``backend/.env`` must still apply."""
    backend = tmp_path / "backend"
    backend.mkdir(parents=True)
    main_py = backend / "main.py"
    main_py.write_text("#", encoding="utf-8")
    (backend / ".env").write_text(
        "EXOSITES_GOOGLE_CLIENT_ID=from-dotenv.apps.googleusercontent.com\n"
        "EXOSITES_GOOGLE_CLIENT_SECRET=secret-from-file\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("EXOSITES_GOOGLE_CLIENT_ID", "placeholder-from-parent")
    monkeypatch.setenv("EXOSITES_GOOGLE_CLIENT_SECRET", "parent-secret")
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    monkeypatch.delattr(sys, "frozen", raising=False)

    load_dotenv_early(main_file=str(main_py))

    assert os.environ["EXOSITES_GOOGLE_CLIENT_ID"] == "from-dotenv.apps.googleusercontent.com"
    assert os.environ["EXOSITES_GOOGLE_CLIENT_SECRET"] == "secret-from-file"


def test_load_dotenv_early_skips_ollama_api_key_when_sort_credentials_managed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Cloud-managed sort keys from Electron must not be replaced by ``backend/.env``."""
    backend = tmp_path / "backend"
    backend.mkdir(parents=True)
    main_py = backend / "main.py"
    main_py.write_text("#", encoding="utf-8")
    (backend / ".env").write_text(
        "OLLAMA_API_KEY=stale-from-dotenv\nOLLAMA_HOST=https://llm-staging.exosites.ch\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("EXOSITES_SORT_CREDENTIALS_MANAGED", "1")
    monkeypatch.setenv("OLLAMA_API_KEY", "virtual-from-electron")
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    monkeypatch.delattr(sys, "frozen", raising=False)

    load_dotenv_early(main_file=str(main_py))

    assert os.environ["OLLAMA_API_KEY"] == "virtual-from-electron"
    assert os.environ["OLLAMA_HOST"] == "https://llm-staging.exosites.ch"


def test_parse_env_file_loose_reads_export_and_quoted_values(tmp_path: Path) -> None:
    p = tmp_path / "x.env"
    p.write_text(
        'export EXOSITES_GOOGLE_CLIENT_ID=id.apps.googleusercontent.com\n'
        'EXOSITES_GOOGLE_CLIENT_SECRET="GOCSPX-secret"\n'
        "# comment\n"
        "EXOSITES_GOOGLE_OAUTH_CLIENT_JSON=\n",
        encoding="utf-8",
    )
    d = _parse_env_file_loose(p)
    assert d["EXOSITES_GOOGLE_CLIENT_ID"] == "id.apps.googleusercontent.com"
    assert d["EXOSITES_GOOGLE_CLIENT_SECRET"] == "GOCSPX-secret"


def test_apply_dotenv_utf8_bom_key_still_sets_var(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    p = tmp_path / "bom.env"
    p.write_bytes(b"\xef\xbb\xbfOTHER=bom-value\n")
    monkeypatch.delenv("OTHER", raising=False)
    apply_dotenv_files([p])
    assert os.environ["OTHER"] == "bom-value"


def test_dotenv_candidate_paths_includes_exe_dir_when_frozen(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    main_py = tmp_path / "backend" / "main.py"
    main_py.parent.mkdir(parents=True)
    main_py.touch()
    fake_exe = tmp_path / "dist" / "backend.exe"
    fake_exe.parent.mkdir(parents=True)
    fake_exe.touch()

    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    monkeypatch.setattr(dotenv_bootstrap.sys, "frozen", True, raising=False)
    monkeypatch.setattr(dotenv_bootstrap.sys, "executable", str(fake_exe), raising=False)
    paths = dotenv_candidate_paths(str(main_py))
    assert fake_exe.parent / ".env" in paths
