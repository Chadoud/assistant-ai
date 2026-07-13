"""Tests for normalizing the AI-authored build plan."""

from codegen.generator import _normalize_plan


def test_normalize_plan_keeps_valid_steps_and_files():
    plan = _normalize_plan(
        {
            "stack": "Vite + React + TS",
            "steps": [
                {"title": "Build the feed", "kind": "generate"},
                {"title": "Install", "kind": "install"},
                {"title": "Live preview", "kind": "preview"},
            ],
            "app_files": ["src/App.tsx", "src/components/Feed.tsx"],
            "dependencies": {"zustand": "^4.5.0"},
        }
    )
    assert [s["title"] for s in plan["steps"]] == ["Build the feed", "Install", "Live preview"]
    assert plan["app_files"][0] == "src/App.tsx"
    assert plan["dependencies"] == {"zustand": "^4.5.0"}


def test_normalize_plan_coerces_unknown_kind_and_guards_app_files():
    plan = _normalize_plan(
        {
            "steps": [{"title": "Do magic", "kind": "wizardry"}],
            "app_files": ["../escape.ts", "index.html", "src/ok.tsx"],
        }
    )
    assert plan["steps"][0]["kind"] == "generate"
    # Path traversal and non-src files are rejected; App.tsx is always present.
    assert "../escape.ts" not in plan["app_files"]
    assert "index.html" not in plan["app_files"]
    assert "src/ok.tsx" in plan["app_files"]
    assert "src/App.tsx" in plan["app_files"]


def test_normalize_plan_falls_back_to_default_steps_when_empty():
    plan = _normalize_plan({"steps": [], "app_files": []})
    assert len(plan["steps"]) >= 4
    assert plan["app_files"] == ["src/App.tsx"]
