"""Tests for codegen install/dev skip heuristics."""

from __future__ import annotations

from pathlib import Path

from codegen.install_policy import (
    should_reuse_dev_server,
    should_skip_install,
    stack_requires_install,
)


def test_skip_install_when_node_modules_and_no_manifest_change(tmp_path: Path) -> None:
    (tmp_path / "node_modules").mkdir()
    assert should_skip_install(tmp_path, ["src/App.tsx"], is_follow_up=True) is True


def test_install_when_package_json_changed(tmp_path: Path) -> None:
    (tmp_path / "node_modules").mkdir()
    assert should_skip_install(tmp_path, ["package.json"], is_follow_up=True) is False


def test_install_on_fresh_build_even_with_node_modules(tmp_path: Path) -> None:
    (tmp_path / "node_modules").mkdir()
    assert should_skip_install(tmp_path, ["src/App.tsx"], is_follow_up=False) is False


def test_reuse_dev_server_on_source_only_follow_up() -> None:
    assert should_reuse_dev_server(["src/App.tsx"], is_follow_up=True) is True
    assert should_reuse_dev_server(["package.json"], is_follow_up=True) is False


def test_stack_requires_install_only_with_package_json(tmp_path) -> None:
    assert stack_requires_install(tmp_path, "npm install") is False
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    assert stack_requires_install(tmp_path, "npm install") is True
    assert stack_requires_install(tmp_path, None) is False
