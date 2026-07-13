"""Audit log must never persist raw secrets in argument summaries."""

from __future__ import annotations

from orchestrator.audit import _summarize_args


def test_summarize_args_redacts_named_secrets() -> None:
    summary = _summarize_args(
        {
            "path": "/tmp/file.pdf",
            "api_key": "AIzaSySuperSecretKey123456789",
            "nested": {"access_token": "tok-abc"},
        }
    )
    assert "AIzaSy" not in summary
    assert "tok-abc" not in summary
    assert "[REDACTED]" in summary
    assert "/tmp/file.pdf" in summary


def test_summarize_args_redacts_bearer_strings() -> None:
    summary = _summarize_args({"header": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"})
    assert "eyJhbGci" not in summary
    assert "[REDACTED]" in summary
