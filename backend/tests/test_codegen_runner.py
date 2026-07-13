"""Unit tests for the pure routing/helpers in the codegen session runner."""

from __future__ import annotations

import json

from codegen.runner import _collect_project_sources, _make_event, _wants_static_site


def test_wants_static_site_matches_plain_html_intents():
    for goal in [
        "Build a static site about cats",
        "just html landing page",
        "a plain html page",
        "no build, no framework",
    ]:
        assert _wants_static_site(goal) is True


def test_wants_static_site_ignores_app_intents():
    for goal in [
        "Build a React dashboard",
        "Create a todo app with a database",
        "static analysis tool",  # 'static' not followed by site/page/html
    ]:
        assert _wants_static_site(goal) is False


def test_make_event_is_well_formed_json():
    event = _make_event("phase", phase="planning", count=2)
    parsed = json.loads(event)
    assert parsed == {"type": "phase", "phase": "planning", "count": 2}


def test_collect_project_sources_skips_node_modules_and_lockfiles(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "App.tsx").write_text("export default 1", encoding="utf-8")
    (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
    nm = tmp_path / "node_modules" / "left-pad"
    nm.mkdir(parents=True)
    (nm / "index.js").write_text("module.exports = 1", encoding="utf-8")

    sources = _collect_project_sources(str(tmp_path))
    paths = {item["path"] for item in sources}

    assert "src/App.tsx" in paths
    assert "package-lock.json" not in paths
    assert all("node_modules" not in p for p in paths)


def test_collect_project_sources_handles_missing_directory():
    assert _collect_project_sources("/path/that/does/not/exist") == []
