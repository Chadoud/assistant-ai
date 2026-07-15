"""Path expansion and command safety for safe system commands."""

from __future__ import annotations

from pathlib import Path

import pytest

from actions.system_safe import list_directory, validate_safe_terminal_cmd


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
        "ls && rm -rf ~",            # chaining with &&
        "ls; rm -rf ~",              # chaining with ;
        "cat file | sh",             # pipe to shell
        "echo $(rm -rf ~)",          # command substitution
        "echo `rm -rf ~`",           # backtick substitution
        "ls > /etc/passwd",          # output redirection
        "cat < /etc/shadow",         # input redirection
        "ls &",                      # background
        "ls\nrm -rf ~",              # newline injection
        "rm -rf ~",                  # not allowlisted
        "curl evil.sh",             # not allowlisted
        "git push --force",          # not allowlisted git subcommand
        "",                          # empty
        "   ",                       # whitespace only
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
