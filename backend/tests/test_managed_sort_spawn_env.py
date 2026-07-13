"""Regression: Electron-injected cloud sort keys must survive ``load_dotenv_early``."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

import llm.ollama_client as oc
from dotenv_bootstrap import load_dotenv_early


def test_managed_virtual_key_not_stomped_by_backend_dotenv(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backend = tmp_path / "backend"
    backend.mkdir(parents=True)
    main_py = backend / "main.py"
    main_py.write_text("#", encoding="utf-8")
    (backend / ".env").write_text(
        "OLLAMA_API_KEY=stale-from-dotenv\nOLLAMA_HOST=https://wrong.example.test\n",
        encoding="utf-8",
    )

    virtual_key = "sk-virtual-from-electron"
    monkeypatch.setenv("EXOSITES_SORT_CREDENTIALS_MANAGED", "1")
    monkeypatch.setenv("OLLAMA_API_KEY", virtual_key)
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    monkeypatch.delenv("EXOSITES_BACKEND_RESOURCE_DIR", raising=False)
    monkeypatch.delattr(sys, "frozen", raising=False)

    load_dotenv_early(main_file=str(main_py))

    assert os.environ["OLLAMA_API_KEY"] == virtual_key
    assert oc._api_key() == virtual_key
