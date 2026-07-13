"""Tests for activity capture window title normalization."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import activity_capture as ac


def test_normalize_window_title_calls_callable_title():
    win = SimpleNamespace(title=lambda: "Memory — Facts")
    assert ac._normalize_window_title(win) == "Memory — Facts"


def test_normalize_window_title_rejects_method_repr():
    class BrokenWindow:
        title = "<built-in method title of str object at 0x123>"

    assert ac._normalize_window_title(BrokenWindow()) == ""


def test_active_window_uses_normalized_title(monkeypatch):
    win = SimpleNamespace(title=lambda: "Desktop")
    fake_gw = SimpleNamespace(getActiveWindow=lambda: win)
    monkeypatch.setitem(sys.modules, "pygetwindow", fake_gw)
    assert ac._active_window() == ("", "Desktop")
