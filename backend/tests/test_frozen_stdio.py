import sys

from frozen_stdio import ensure_stdio_streams


def test_ensure_stdio_streams_replaces_none(monkeypatch):
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    ensure_stdio_streams()
    assert sys.stdout is not None
    assert sys.stderr is not None
    assert hasattr(sys.stderr, "write")
