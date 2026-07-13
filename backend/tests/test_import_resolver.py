"""Tests for the static local-import resolver used by Codegen self-correction."""

from __future__ import annotations

from pathlib import Path

from codegen.import_resolver import describe_missing_imports, find_unresolved_local_imports


def _write(root: Path, rel: str, content: str) -> None:
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def test_detects_missing_relative_import(tmp_path: Path) -> None:
    _write(tmp_path, "src/main.tsx", 'import App from "./App.tsx";\nimport "./index.css";')
    _write(tmp_path, "src/index.css", "body{}")

    missing = find_unresolved_local_imports(str(tmp_path))

    specifiers = {m.specifier for m in missing}
    assert "./App.tsx" in specifiers
    assert "./index.css" not in specifiers  # it exists


def test_resolves_extensionless_and_index_imports(tmp_path: Path) -> None:
    _write(tmp_path, "src/main.tsx", 'import App from "./App";\nimport { x } from "./lib";')
    _write(tmp_path, "src/App.tsx", "export default function App(){return null;}")
    _write(tmp_path, "src/lib/index.ts", "export const x = 1;")

    assert find_unresolved_local_imports(str(tmp_path)) == []


def test_ignores_bare_package_imports(tmp_path: Path) -> None:
    _write(tmp_path, "src/main.tsx", 'import React from "react";\nimport ReactDOM from "react-dom/client";')

    assert find_unresolved_local_imports(str(tmp_path)) == []


def test_handles_require_and_dynamic_import(tmp_path: Path) -> None:
    _write(tmp_path, "src/a.js", 'const b = require("./b");\nimport("./c");')

    specifiers = {m.specifier for m in find_unresolved_local_imports(str(tmp_path))}
    assert specifiers == {"./b", "./c"}


def test_skips_node_modules(tmp_path: Path) -> None:
    _write(tmp_path, "node_modules/pkg/index.js", 'import "./missing-dep";')
    _write(tmp_path, "src/main.tsx", 'import App from "./App.tsx";')
    _write(tmp_path, "src/App.tsx", "export default 1;")

    assert find_unresolved_local_imports(str(tmp_path)) == []


def test_describe_missing_imports_lists_each_entry(tmp_path: Path) -> None:
    _write(tmp_path, "src/main.tsx", 'import App from "./App.tsx";')

    description = describe_missing_imports(find_unresolved_local_imports(str(tmp_path)))

    assert "./App.tsx" in description
    assert "src/main.tsx" in description
