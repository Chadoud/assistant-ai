"""Tests for writable_env_file_path (packaged vs dev persistence)."""

from __future__ import annotations

import os
import pathlib
import sys
from unittest import mock

from dotenv_bootstrap import writable_env_file_path


def test_writable_env_prefers_user_data() -> None:
    with mock.patch.dict(os.environ, {"EXOSITES_USER_DATA": "/tmp/exo-user"}, clear=False):
        with mock.patch.object(sys, "frozen", False, create=True):
            assert writable_env_file_path() == pathlib.Path("/tmp/exo-user/.env")


def test_writable_env_frozen_without_user_data_uses_exe_dir() -> None:
    env = {k: v for k, v in os.environ.items() if k != "EXOSITES_USER_DATA"}
    with mock.patch.dict(os.environ, env, clear=True):
        with mock.patch.object(sys, "frozen", True, create=True):
            with mock.patch.object(sys, "executable", "/Applications/Exo.app/Contents/MacOS/backend"):
                path = writable_env_file_path()
                assert path.name == ".env"
                assert path.parent.name == "MacOS"
