"""Unit tests for codegen stack detection."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from codegen.stack_detector import detect_stack


def _write_pkg(root: Path, scripts: dict, deps: dict | None = None) -> None:
    payload = {"name": "demo", "scripts": scripts}
    if deps:
        payload["dependencies"] = deps
    (root / "package.json").write_text(json.dumps(payload), encoding="utf-8")


def test_vite_dev_script(tmp_path: Path) -> None:
    _write_pkg(tmp_path, {"dev": "vite"}, {"vite": "^5.0.0", "react": "^18.0.0"})
    plan = detect_stack(tmp_path, default_port=5301)
    assert plan.stack_label == "vite"
    assert plan.install_command == "npm install"
    # Host/port are forwarded so Vite binds where the preview loads it.
    assert plan.dev_command == "npm run dev -- --host 127.0.0.1 --port 5301"
    assert plan.port_hint == 5301


def test_cra_start_script(tmp_path: Path) -> None:
    _write_pkg(tmp_path, {"start": "react-scripts start"}, {"react-scripts": "5.0.1"})
    plan = detect_stack(tmp_path)
    assert plan.stack_label == "cra"
    assert plan.dev_command == "npm start"


def test_next_dev_script(tmp_path: Path) -> None:
    _write_pkg(tmp_path, {"dev": "next dev"}, {"next": "14.0.0"})
    plan = detect_stack(tmp_path, default_port=5302)
    assert plan.stack_label == "next"
    assert plan.dev_command == "npm run dev -- -p 5302 -H 127.0.0.1"


def test_vite_dep_without_script(tmp_path: Path) -> None:
    _write_pkg(tmp_path, {}, {"vite": "^5.0.0"})
    plan = detect_stack(tmp_path, default_port=5310)
    assert plan.stack_label == "vite"
    assert "5310" in plan.dev_command


def test_static_index_html(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><html></html>", encoding="utf-8")
    plan = detect_stack(tmp_path, default_port=5320)
    assert plan.stack_label == "static"
    assert plan.install_command is None
    assert not plan.needs_install
    assert "serve" in plan.dev_command
    assert "5320" in plan.dev_command


def test_pnpm_lockfile_install(tmp_path: Path) -> None:
    _write_pkg(tmp_path, {"dev": "vite"}, {"vite": "^5.0.0"})
    (tmp_path / "pnpm-lock.yaml").write_text("lockfileVersion: 5.4\n", encoding="utf-8")
    plan = detect_stack(tmp_path)
    assert plan.install_command == "pnpm install"


def test_missing_dev_strategy_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="dev script"):
        detect_stack(tmp_path)
