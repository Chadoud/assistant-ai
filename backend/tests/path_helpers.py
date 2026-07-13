"""
Temp directories that pass output_dir_guard.

``tempfile.TemporaryDirectory()`` lives under ``/tmp`` on Linux runners, which
the guard rejects as a system-protected root (Windows temp is under the user
profile, so the same tests pass there). Tests that POST an ``output_dir``
must use a directory under the user's home instead.
"""

from __future__ import annotations

import contextlib
import pathlib
import shutil
import tempfile
import uuid
from collections.abc import Iterator

_TEST_TMP_ROOT = pathlib.Path.home() / ".ai-manager" / "test-tmp"


@contextlib.contextmanager
def home_safe_tempdir() -> Iterator[pathlib.Path]:
    """Yield a fresh temp directory under home; removed on exit."""
    _TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)
    path = pathlib.Path(tempfile.mkdtemp(dir=_TEST_TMP_ROOT))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def safe_output_dir_string() -> str:
    """A guard-safe output_dir for tests that never write to it."""
    return str(_TEST_TMP_ROOT / f"out-{uuid.uuid4().hex[:8]}")
