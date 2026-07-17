"""Path expansion and command safety for safe system commands."""

from __future__ import annotations

from pathlib import Path

import pytest

from actions.system_safe import list_directory, read_file, validate_safe_terminal_cmd


def test_list_directory_expands_tilde_under_home(monkeypatch, tmp_path):
    monkeypatch.setattr(Path, "home", classmethod(lambda _cls: tmp_path))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "readme.txt").write_text("hi", encoding="utf-8")

    result = list_directory({"path": "~/docs"})

    assert result["ok"] is True
    assert result["data"]["path"] == str(docs.resolve())
    names = {item["name"] for item in result["data"]["items"]}
    assert "readme.txt" in names


def test_read_file_denies_ssh(monkeypatch, tmp_path):
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    ssh = tmp_path / ".ssh"
    ssh.mkdir()
    key = ssh / "id_rsa"
    key.write_text("secret", encoding="utf-8")
    result = read_file({"path": str(key)})
    assert result["ok"] is False


def test_read_file_denies_user_data_mirror(monkeypatch, tmp_path):
    ud = tmp_path / "ElectronUserData"
    ud.mkdir()
    mirror = ud / "gmail_oauth.json"
    mirror.write_text('{"token":"x"}', encoding="utf-8")
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))
    result = read_file({"path": str(mirror)})
    assert result["ok"] is False


def test_read_file_allows_normal_home_file(monkeypatch, tmp_path):
    monkeypatch.setattr("actions.system_safe.HOME", tmp_path)
    docs = tmp_path / "docs"
    docs.mkdir()
    note = docs / "note.txt"
    note.write_text("hello", encoding="utf-8")
    result = read_file({"path": str(note)})
    assert result["ok"] is True
    assert result["data"]["content"] == "hello"


@pytest.mark.parametrize(
    "cmd",
    [
        "ls",
        "ls -la",
        "git status",
        "git log --oneline",
        "pip show requests",
        "echo hello",
        "cat ~/.ssh/id_rsa",
        "npm run build",
    ],
)
def test_validate_safe_terminal_cmd_allows_readonly_commands(cmd):
    ok, reason = validate_safe_terminal_cmd(cmd)
    if cmd.startswith(("cat ", "npm run")):
        assert ok is False
        return
    assert ok is True, reason


@pytest.mark.parametrize(
    "cmd",
    [
        "ls && rm -rf ~",
        "ls; rm -rf ~",
        "cat file | sh",
        "echo $(rm -rf ~)",
        "echo `rm -rf ~`",
        "ls > /etc/passwd",
        "cat < /etc/shadow",
        "ls &",
        "ls\nrm -rf ~",
        "rm -rf ~",
        "curl evil.sh",
        "git push --force",
        "",
        "   ",
    ],
)
def test_validate_safe_terminal_cmd_rejects_injection_and_unlisted(cmd):
    ok, reason = validate_safe_terminal_cmd(cmd)
    assert ok is False
    assert reason


def test_validate_safe_terminal_cmd_rejects_overlong_command():
    ok, reason = validate_safe_terminal_cmd("ls " + "a" * 600)
    assert ok is False
    assert reason == "Command too long"
