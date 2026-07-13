"""Tests for the classify-first self-repair loop in the codegen runner."""

from __future__ import annotations

import asyncio
import json

import pytest

from codegen import session_store
from codegen.runner import repair_session_files
from codegen.session_store import CodegenSession

_SCAFFOLD_PKG = {
    "name": "codegen-app",
    "private": True,
    "version": "0.0.0",
    "type": "module",
    "scripts": {"dev": "vite"},
    "dependencies": {"react": "^18.3.1", "react-dom": "^18.3.1"},
    "devDependencies": {"vite": "^5.2.0"},
}

_MISSING_UUID_ERROR = (
    "The following dependencies are imported but could not be resolved:\n"
    "  uuid (imported by /studio/s1/src/App.tsx)\n"
    "Are they installed?"
)


@pytest.fixture
def studio(tmp_path, monkeypatch):
    monkeypatch.setattr(session_store, "STUDIO_ROOT", tmp_path)
    monkeypatch.setattr(session_store, "PERSIST_PATH", tmp_path / "sessions.json")
    monkeypatch.setattr(session_store, "_sessions", {})
    return tmp_path


def _make_session(studio, session_id="sess-repair", goal="Build a React dashboard"):
    root = studio / session_id
    root.mkdir(parents=True, exist_ok=True)
    session = CodegenSession(session_id=session_id, goal=goal, project_path=str(root.resolve()))
    session_store._sessions[session_id] = session
    return session, root


def _write_scaffold(root, *, app_source='import { v4 } from "uuid";\nexport default function App() { return null; }\n'):
    (root / "package.json").write_text(json.dumps(_SCAFFOLD_PKG), encoding="utf-8")
    src = root / "src"
    src.mkdir(exist_ok=True)
    (src / "App.tsx").write_text(app_source, encoding="utf-8")


class TestDeterministicRepair:
    def test_missing_npm_package_is_fixed_without_llm(self, studio):
        session, root = _make_session(studio)
        _write_scaffold(root)

        result = asyncio.run(repair_session_files(session, _MISSING_UUID_ERROR))

        assert result["ok"] is True
        assert result["strategy"] == "deterministic"
        assert result["error_class"] == "missing_npm_package"
        assert result["needs_install"] is True
        assert "uuid" in result["packages"]
        pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert "uuid" in pkg["dependencies"]
        assert session.llm_repair_attempts == 0

    def test_declared_but_not_installed_forces_install(self, studio):
        session, root = _make_session(studio)
        _write_scaffold(root)
        pkg = {**_SCAFFOLD_PKG, "dependencies": {**_SCAFFOLD_PKG["dependencies"], "uuid": "^9.0.1"}}
        (root / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

        result = asyncio.run(repair_session_files(session, _MISSING_UUID_ERROR))

        assert result["ok"] is True
        assert result["strategy"] == "deterministic"
        assert result["needs_install"] is True
        assert result["changed"] == []

    def test_registry_404_falls_back_to_latest(self, studio):
        session, root = _make_session(studio)
        _write_scaffold(root)
        pkg = {**_SCAFFOLD_PKG, "dependencies": {**_SCAFFOLD_PKG["dependencies"], "framer-motion": "^99.0.0"}}
        (root / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

        result = asyncio.run(
            repair_session_files(
                session,
                "npm error code ETARGET\nnpm error notarget No matching version found for framer-motion@^99.0.0.",
            )
        )

        assert result["ok"] is True
        assert result["strategy"] == "deterministic"
        assert result["needs_install"] is True
        updated = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert updated["dependencies"]["framer-motion"] == "latest"


class TestEscalationAndBudget:
    def test_repeated_deterministic_error_escalates_to_llm(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root)

        first = asyncio.run(repair_session_files(session, _MISSING_UUID_ERROR))
        assert first["strategy"] == "deterministic"

        llm_calls: list[str] = []

        def fake_repair(goal, error_text, files, *, provider=None, on_relay=None, error_class=None):
            llm_calls.append(error_class)
            return [{"path": "src/App.tsx", "content": "export default function App() { return null; }\n"}]

        monkeypatch.setattr("codegen.runner.repair_project_files", fake_repair)

        second = asyncio.run(repair_session_files(session, _MISSING_UUID_ERROR))
        assert second["ok"] is True
        assert second["strategy"] == "llm"
        assert llm_calls == ["missing_npm_package"]

    def test_same_error_after_llm_repair_gives_up(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root, app_source="export default 1\n")
        monkeypatch.setattr(
            "codegen.runner.repair_project_files",
            lambda *a, **k: [{"path": "src/App.tsx", "content": "export default 2\n"}],
        )
        error = "Transform failed with 1 error: Unexpected token (12:5)"

        first = asyncio.run(repair_session_files(session, error))
        assert first["ok"] is True and first["strategy"] == "llm"

        second = asyncio.run(repair_session_files(session, error))
        assert second["ok"] is False
        assert second.get("budget_exhausted") is True

    def test_llm_budget_is_bounded(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root, app_source="export default 1\n")
        monkeypatch.setattr(
            "codegen.runner.repair_project_files",
            lambda *a, **k: [{"path": "src/App.tsx", "content": "export default 2\n"}],
        )
        # Distinct syntax errors so the fingerprint changes each time.
        for i in range(3):
            result = asyncio.run(
                repair_session_files(session, f"Unexpected token error-variant-{'x' * (i + 1) * 3}")
            )
            assert result["ok"] is True

        final = asyncio.run(repair_session_files(session, "Unexpected token yet-another-brand-new-error"))
        assert final["ok"] is False
        assert final.get("budget_exhausted") is True


class TestScaffoldGuard:
    def test_llm_repair_cannot_overwrite_scaffold_files(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root, app_source="export default 1\n")
        (root / "vite.config.ts").write_text("// scaffold config\n", encoding="utf-8")

        monkeypatch.setattr(
            "codegen.runner.repair_project_files",
            lambda *a, **k: [
                {"path": "vite.config.ts", "content": "// hostile rewrite\n"},
                {"path": "src/App.tsx", "content": "export default 2\n"},
            ],
        )

        result = asyncio.run(repair_session_files(session, "Unexpected token in src/App.tsx"))

        assert result["ok"] is True
        assert (root / "vite.config.ts").read_text(encoding="utf-8") == "// scaffold config\n"
        assert "vite.config.ts" not in result["changed"]
        assert "src/App.tsx" in result["changed"]

    def test_llm_package_json_becomes_dependency_merge(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root, app_source="export default 1\n")

        monkeypatch.setattr(
            "codegen.runner.repair_project_files",
            lambda *a, **k: [
                {
                    "path": "package.json",
                    "content": json.dumps({"name": "evil", "dependencies": {"uuid": "^9.0.1"}}),
                },
                {"path": "src/App.tsx", "content": "export default 2\n"},
            ],
        )

        result = asyncio.run(repair_session_files(session, "Unexpected token in src/App.tsx"))

        assert result["ok"] is True
        assert result["needs_install"] is True
        pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert pkg["name"] == "codegen-app"  # scaffold identity preserved
        assert pkg["dependencies"]["uuid"] == "^9.0.1"  # deps merged in

    def test_llm_repair_reconciles_new_bare_imports(self, studio, monkeypatch):
        session, root = _make_session(studio)
        _write_scaffold(root, app_source="export default 1\n")

        monkeypatch.setattr(
            "codegen.runner.repair_project_files",
            lambda *a, **k: [
                {"path": "src/App.tsx", "content": 'import { create } from "zustand";\nexport default 2\n'}
            ],
        )

        result = asyncio.run(repair_session_files(session, "Unexpected token in src/App.tsx"))

        assert result["ok"] is True
        assert result["needs_install"] is True
        pkg = json.loads((root / "package.json").read_text(encoding="utf-8"))
        assert "zustand" in pkg["dependencies"]


def test_session_without_project_path(studio):
    session = CodegenSession(session_id="no-path", goal="x", project_path=None)
    result = asyncio.run(repair_session_files(session, "boom"))
    assert result["ok"] is False
