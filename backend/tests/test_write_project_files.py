"""Path guard tests for Codegen Studio file writes."""

from __future__ import annotations

import uuid

import pytest

from actions.write_project_files import list_project_tree, read_project_file, write_project_files
from codegen.session_store import studio_dir


@pytest.fixture()
def session_id() -> str:
    sid = str(uuid.uuid4())
    studio_dir(sid).mkdir(parents=True, exist_ok=True)
    return sid


def test_write_and_read_round_trip(session_id: str) -> None:
    result = write_project_files(
        {
            "session_id": session_id,
            "files": [
                {"path": "src/App.tsx", "content": "export default function App() { return null; }"},
                {"path": "package.json", "content": '{"name":"demo"}'},
            ],
        }
    )
    assert result["ok"] is True
    assert result["data"]["count"] == 2

    read_back = read_project_file({"session_id": session_id, "path": "src/App.tsx"})
    assert read_back["ok"] is True
    assert "App" in read_back["data"]["content"]

    tree = list_project_tree({"session_id": session_id})
    assert tree["ok"] is True
    paths = {item["path"] for item in tree["data"]["files"]}
    assert "src/App.tsx" in paths


def test_rejects_path_traversal(session_id: str) -> None:
    result = write_project_files(
        {"session_id": session_id, "files": [{"path": "../escape.txt", "content": "nope"}]}
    )
    assert result["ok"] is False
    assert "Invalid path" in result["error"]


def test_rejects_oversized_file(session_id: str) -> None:
    huge = "x" * (512 * 1024 + 1)
    result = write_project_files(
        {"session_id": session_id, "files": [{"path": "big.txt", "content": huge}]}
    )
    assert result["ok"] is False
    assert "too large" in result["error"].lower()


def test_files_written_on_disk(session_id: str) -> None:
    write_project_files(
        {"session_id": session_id, "files": [{"path": "index.html", "content": "<html></html>"}]}
    )
    target = studio_dir(session_id) / "index.html"
    assert target.is_file()
    assert target.read_text(encoding="utf-8") == "<html></html>"
