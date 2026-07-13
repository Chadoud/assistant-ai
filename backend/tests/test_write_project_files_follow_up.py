"""Follow-up sessions must write into the parent project directory."""

from __future__ import annotations

from pathlib import Path

from actions.write_project_files import list_project_tree, write_project_files
from codegen.session_store import create_follow_up_session, create_session


def test_follow_up_writes_into_parent_project(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("codegen.session_store.STUDIO_ROOT", tmp_path / "studio")
    monkeypatch.setattr("codegen.session_store.PERSIST_PATH", tmp_path / "studio" / "sessions.json")

    parent = create_session("Build app")
    parent_root = Path(parent.project_path)
    parent_root.mkdir(parents=True, exist_ok=True)
    (parent_root / "package.json").write_text('{"name":"demo"}', encoding="utf-8")

    child = create_follow_up_session("Make header blue", parent.session_id)
    result = write_project_files(
        {
            "session_id": child.session_id,
            "files": [{"path": "src/App.tsx", "content": "export default function App() { return null; }"}],
        }
    )
    assert result["ok"] is True
    assert (parent_root / "src" / "App.tsx").is_file()
    assert not (tmp_path / "studio" / child.session_id / "src" / "App.tsx").exists()

    listing = list_project_tree({"session_id": child.session_id})
    assert listing["ok"] is True
    paths = {item["path"] for item in listing["data"]["files"]}
    assert "src/App.tsx" in paths
