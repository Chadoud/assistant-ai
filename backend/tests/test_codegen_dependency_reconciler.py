"""Unit tests for package.json ⟷ bare-import reconciliation."""

from __future__ import annotations

import json

from codegen.dependency_reconciler import (
    find_bare_imports,
    merged_package_json_text,
    missing_dependencies,
    version_for_package,
)


def _write_project(tmp_path, package_json: dict, sources: dict[str, str]):
    (tmp_path / "package.json").write_text(json.dumps(package_json), encoding="utf-8")
    for rel, content in sources.items():
        target = tmp_path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


_BASE_PKG = {
    "name": "codegen-app",
    "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1"},
    "devDependencies": {"vite": "^5.2.0"},
}


class TestFindBareImports:
    def test_collects_bare_imports_and_skips_relative(self, tmp_path):
        _write_project(
            tmp_path,
            _BASE_PKG,
            {
                "src/App.tsx": (
                    'import { v4 } from "uuid";\n'
                    'import Feed from "./components/Feed";\n'
                    'import { create } from "zustand";\n'
                )
            },
        )
        assert find_bare_imports(tmp_path) == {"uuid", "zustand"}

    def test_handles_subpaths_scopes_and_builtins(self, tmp_path):
        _write_project(
            tmp_path,
            _BASE_PKG,
            {
                "src/main.tsx": (
                    'import ReactDOM from "react-dom/client";\n'
                    'import { useQuery } from "@tanstack/react-query";\n'
                    'import path from "node:path";\n'
                )
            },
        )
        found = find_bare_imports(tmp_path)
        assert "react-dom" in found
        assert "@tanstack/react-query" in found
        assert not any(name in found for name in ("path", "node:path"))

    def test_skips_node_modules(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {"node_modules/dep/index.js": 'require("left-pad")'})
        assert "left-pad" not in find_bare_imports(tmp_path)

    def test_missing_directory(self):
        assert find_bare_imports("/does/not/exist") == set()


class TestMissingDependencies:
    def test_reports_undeclared_imports_with_pinned_versions(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {"src/App.tsx": 'import { v4 } from "uuid";'})
        missing = missing_dependencies(tmp_path)
        assert missing == {"uuid": version_for_package("uuid")}
        assert missing["uuid"] != "latest"  # uuid is on the curated pin list

    def test_unpinned_package_falls_back_to_latest(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {"src/App.tsx": 'import x from "some-very-obscure-pkg";'})
        assert missing_dependencies(tmp_path) == {"some-very-obscure-pkg": "latest"}

    def test_declared_packages_are_not_reported(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {"src/App.tsx": 'import React from "react";'})
        assert missing_dependencies(tmp_path) == {}

    def test_static_project_without_package_json(self, tmp_path):
        (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
        assert missing_dependencies(tmp_path) == {}


class TestMergedPackageJsonText:
    def test_merges_additions_into_dependencies(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {})
        text = merged_package_json_text(tmp_path, {"uuid": "^9.0.1"})
        pkg = json.loads(text)
        assert pkg["dependencies"]["uuid"] == "^9.0.1"
        assert pkg["dependencies"]["react"] == "^18.3.1"  # existing deps preserved

    def test_does_not_override_declared_versions_by_default(self, tmp_path):
        _write_project(tmp_path, _BASE_PKG, {})
        assert merged_package_json_text(tmp_path, {"react": "^19.0.0"}) is None

    def test_overwrite_versions_replaces_hallucinated_pin(self, tmp_path):
        pkg = {**_BASE_PKG, "dependencies": {**_BASE_PKG["dependencies"], "uuid": "^99.0.0"}}
        _write_project(tmp_path, pkg, {})
        text = merged_package_json_text(tmp_path, {"uuid": "latest"}, overwrite_versions=True)
        assert json.loads(text)["dependencies"]["uuid"] == "latest"

    def test_returns_none_without_package_json(self, tmp_path):
        assert merged_package_json_text(tmp_path, {"uuid": "latest"}) is None
