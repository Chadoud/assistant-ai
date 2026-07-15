"""
Unit tests for output_dir_guard.is_safe_output_dir / assert_safe_output_dir.

We test portable logic (home-relative paths, empty input) plus platform-specific
blocked roots only when running on the matching OS.
"""

from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from output_dir_guard import assert_safe_output_dir, is_safe_output_dir


class TestIsEmptyOrInvalid:
    def test_empty_string_rejected(self):
        ok, _ = is_safe_output_dir("")
        assert not ok

    def test_blank_string_rejected(self):
        ok, _ = is_safe_output_dir("   ")
        assert not ok


class TestHomeSubdirAllowed:
    # pytest's tmp_path lives under /tmp on Linux, which the guard rejects —
    # use home-relative paths (the guard never touches the filesystem).
    def test_home_subdir_accepted(self):
        """Any path that doesn't fall under a blocked root should be accepted."""
        home = pathlib.Path.home()
        ok, reason = is_safe_output_dir(str(home / "Documents" / "sorted_documents"))
        assert ok, reason

    def test_assert_does_not_raise_for_safe_path(self):
        home = pathlib.Path.home()
        assert_safe_output_dir(str(home / "my_sort_output"))


class TestSystemPathsBlocked:
    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only paths")
    def test_windows_system32_blocked(self):
        ok, reason = is_safe_output_dir("C:\\Windows\\System32")
        assert not ok, "C:\\Windows\\System32 must be blocked"
        assert "system-protected" in reason.lower() or "protected" in reason.lower()

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-only paths")
    def test_program_files_blocked(self):
        ok, _ = is_safe_output_dir("C:\\Program Files\\SomeApp")
        assert not ok

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only paths")
    def test_etc_blocked(self):
        ok, _ = is_safe_output_dir("/etc")
        assert not ok

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only paths")
    def test_etc_subdir_blocked(self):
        ok, _ = is_safe_output_dir("/etc/passwd")
        assert not ok

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only paths")
    def test_usr_blocked(self):
        ok, _ = is_safe_output_dir("/usr/local/bin")
        assert not ok

    @pytest.mark.skipif(sys.platform == "win32", reason="Unix-only paths")
    def test_root_blocked(self):
        ok, _ = is_safe_output_dir("/")
        assert not ok


class TestSshBlocked:
    def test_ssh_dir_blocked(self):
        home = pathlib.Path.home()
        ok, _ = is_safe_output_dir(str(home / ".ssh"))
        assert not ok, "~/.ssh must be blocked"

    def test_gnupg_dir_blocked(self):
        home = pathlib.Path.home()
        ok, _ = is_safe_output_dir(str(home / ".gnupg"))
        assert not ok, "~/.gnupg must be blocked"


class TestAppDataBlocked:
    def test_user_data_env_blocked(self, monkeypatch, tmp_path):
        ud = tmp_path / "ExoUserData"
        ud.mkdir()
        monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))
        ok, reason = is_safe_output_dir(str(ud))
        assert not ok, reason
        ok2, _ = is_safe_output_dir(str(ud / "settings_secrets_v1"))
        assert not ok2

    def test_settings_secrets_dirname_blocked(self, tmp_path):
        secrets = tmp_path / "settings_secrets_v1"
        secrets.mkdir()
        ok, reason = is_safe_output_dir(str(secrets))
        assert not ok, reason


class TestAssertRaises:
    def test_raises_value_error_for_blocked_path(self):
        home = pathlib.Path.home()
        with pytest.raises(ValueError, match="system-protected|protected"):
            assert_safe_output_dir(str(home / ".ssh"))
