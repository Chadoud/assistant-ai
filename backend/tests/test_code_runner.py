"""Behaviour tests for the user-approved Python snippet runner.

`code_runner` executes in a throwaway temp file with `shell=False` and a bounded
timeout. These tests assert the validation guards and that real execution maps
return codes / streams onto the structured result.
"""

from __future__ import annotations

from actions.code_runner import code_runner


def test_empty_code_is_rejected():
    result = code_runner({"code": "   "})
    assert result["ok"] is False
    assert "code is required" in result["error"]


def test_successful_snippet_returns_stdout():
    result = code_runner({"code": "print('hello-from-snippet')"})
    assert result["ok"] is True
    assert result["data"]["returncode"] == 0
    assert "hello-from-snippet" in result["data"]["stdout"]


def test_failing_snippet_reports_nonzero_returncode():
    result = code_runner({"code": "import sys; sys.exit(3)"})
    assert result["ok"] is False
    assert result["data"]["returncode"] == 3


def test_runtime_error_is_captured_in_stderr():
    result = code_runner({"code": "raise ValueError('boom')"})
    assert result["ok"] is False
    assert "boom" in result["data"]["stderr"]


def test_timeout_seconds_are_clamped_into_range():
    # An out-of-range timeout must not raise; the snippet still runs quickly.
    too_small = code_runner({"code": "print(1)", "timeout_sec": 1})
    too_large = code_runner({"code": "print(1)", "timeout_sec": 9999})
    assert too_small["ok"] is True
    assert too_large["ok"] is True
