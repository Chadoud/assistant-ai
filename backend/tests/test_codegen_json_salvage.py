"""Tests for truncated codegen JSON recovery."""

from __future__ import annotations

from codegen.generator import _parse_files_json
from codegen.json_salvage import salvage_file_entries, salvage_paths_list


def test_salvage_complete_files_before_truncation() -> None:
    raw = (
        '{\n  "files": [\n'
        '    {"path": "package.json", "content": "{\\"name\\":\\"demo\\"}"},\n'
        '    {"path": "src/App.tsx", "content": "export default function App() { return null; }"},\n'
        '    {"path": "src/incomplete.tsx", "content": "const x = "\n'
    )
    result = salvage_file_entries(raw)
    assert len(result) == 2
    assert result[0]["path"] == "package.json"
    assert result[1]["path"] == "src/App.tsx"


def test_parse_files_json_salvages_on_decode_error() -> None:
    raw = """{
  "files": [
    {"path": "index.html", "content": "<!doctype html>"},
    {"path": "broken.ts", "content": "unterminated"""
    files = _parse_files_json(raw)
    assert len(files) == 1
    assert files[0]["path"] == "index.html"


def test_salvage_paths_from_truncated_manifest() -> None:
    raw = '{"paths": ["package.json", "src/App.tsx", "src/main.tsx'
    paths = salvage_paths_list(raw)
    assert paths == ["package.json", "src/App.tsx"]
