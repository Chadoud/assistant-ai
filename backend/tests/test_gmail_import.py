"""Tests for Gmail → staging export (body + attachments)."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import gmail_import as gi


def test_canonical_gmail_list_query_maps_legacy_primary_operators_to_full_inbox() -> None:
    assert gi.canonical_gmail_list_query("") == gi.GMAIL_QUERY_DEFAULT_INBOX
    assert gi.canonical_gmail_list_query("category:primary") == gi.GMAIL_QUERY_DEFAULT_INBOX
    assert gi.canonical_gmail_list_query("  in:inbox   category:primary  ") == gi.GMAIL_QUERY_DEFAULT_INBOX
    assert gi.canonical_gmail_list_query(gi.GMAIL_QUERY_INBOX_PRIMARY_TAB) == gi.GMAIL_QUERY_DEFAULT_INBOX
    assert gi.canonical_gmail_list_query("in:inbox is:unread") == "in:inbox is:unread"


def test_body_text_leaf_uses_subject_and_sanitizes() -> None:
    assert gi._body_text_leaf_from_subject("Invoice", "msgX") == "Invoice.txt"
    assert gi._body_text_leaf_from_subject("Re: Hello / world", "id1") == "Re_ Hello _ world.txt"
    assert gi._body_text_leaf_from_subject("", "ab12cd") == "No-subject__ab12cd.txt"
    assert gi._body_text_leaf_from_subject("   ", "xy") == "No-subject__xy.txt"


def test_gmail_list_query_for_import_adds_has_attachment_once() -> None:
    assert gi.gmail_list_query_for_import("in:inbox", "attachments") == "in:inbox has:attachment"
    assert gi.gmail_list_query_for_import("in:inbox has:attachment", "attachments") == "in:inbox has:attachment"
    assert gi.gmail_list_query_for_import("in:inbox", "text") == "in:inbox"
    assert gi.gmail_list_query_for_import("in:inbox", "both") == "in:inbox"


@patch("gmail_import.gmail_list_messages")
def test_estimate_gmail_messages_caps_at_max(mock_list) -> None:
    mock_list.return_value = {"resultSizeEstimate": 200, "messages": [{"id": "m1"}]}
    assert gi.estimate_gmail_messages_to_process("tok", query="in:inbox", import_content="text", max_messages=50) == 50
    mock_list.assert_called_once()
    assert mock_list.call_args.kwargs["max_results"] == 1


def test_refine_result_size_estimate_clamps_to_max_for_text() -> None:
    assert gi.refine_result_size_estimate_value(500, import_content="text", max_messages=200) == 200
    assert gi.refine_result_size_estimate_value(100, import_content="text", max_messages=200) == 100


def test_refine_result_size_estimate_attachments_unchanged_by_max() -> None:
    assert gi.refine_result_size_estimate_value(500, import_content="attachments", max_messages=20) == 500


@patch("gmail_import.gmail_list_messages")
def test_estimate_returns_none_when_no_estimate_field(mock_list) -> None:
    mock_list.return_value = {"messages": [{"id": "m1"}]}
    assert gi.estimate_gmail_messages_to_process("tok", query="*", import_content="text", max_messages=10) is None


@patch("gmail_import.gmail_list_messages")
def test_estimate_attachments_does_not_cap_by_max_files(mock_list) -> None:
    """``max_messages`` is a file cap for attachments export; preflight estimate stays Gmail's size."""
    mock_list.return_value = {"resultSizeEstimate": 200, "messages": [{"id": "m1"}]}
    assert (
        gi.estimate_gmail_messages_to_process(
            "tok", query="in:inbox", import_content="attachments", max_messages=20
        )
        == 200
    )


@patch("gmail_import.gmail_get_user_label")
def test_resolve_gmail_import_message_count_inbox_uses_label_messages_total(mock_label: MagicMock) -> None:
    mock_label.return_value = {"messagesTotal": 27361}
    n = gi.resolve_gmail_import_message_count(
        "tok",
        query="in:inbox",
        import_content="text",
        max_messages=9_007_199_254_740_991,
    )
    assert n == 27361
    mock_label.assert_called_once()


@patch("gmail_import.gmail_list_messages")
def test_resolve_gmail_import_message_count_anywhere_pages_list(mock_list: MagicMock) -> None:
    mock_list.side_effect = [
        {"messages": [{"id": f"m{i}"} for i in range(500)], "nextPageToken": "a"},
        {"messages": [{"id": "z"}], "nextPageToken": None},
    ]
    n = gi.resolve_gmail_import_message_count(
        "tok",
        query="in:anywhere",
        import_content="text",
        max_messages=9_007_199_254_740_991,
    )
    assert n == 501
    assert mock_list.call_count == 2


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"%PDF-1.4\n")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_writes_message_txt_and_attachment_files(
    mock_list,
    mock_get,
    mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)

    mock_list.return_value = {"messages": [{"id": "msgABC"}], "nextPageToken": None}
    mock_get.return_value = {
        "id": "msgABC",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Invoice"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "SGkK"}},  # "Hi\n"
                {
                    "mimeType": "application/pdf",
                    "filename": "invoice.pdf",
                    "body": {"attachmentId": "attXYZ"},
                },
            ],
        },
    }

    paths, staging_root = gi.export_gmail_messages_to_staging(
        "token",
        query="in:inbox",
        max_messages=1,
        import_content="both",
    )

    assert staging_root.is_dir()
    mock_fetch.assert_called_once()
    assert len(paths) == 2
    txt = Path(paths[0])
    pdf = Path(paths[1])
    assert txt.name == "Invoice.txt"
    assert txt.suffix == ".txt"
    assert txt.read_text(encoding="utf-8").startswith("From: a@b.com")
    assert "attachment(s) also saved" in txt.read_text(encoding="utf-8")
    assert pdf.name == "invoice.pdf"
    assert pdf.read_bytes() == b"%PDF-1.4\n"


@patch("gmail_import.gmail_fetch_attachment_bytes")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_text_only_skips_attachment_download(
    mock_list,
    mock_get,
    mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "msgABC"}], "nextPageToken": None}
    mock_get.return_value = {
        "id": "msgABC",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Hello"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "QQ=="}},
                {
                    "mimeType": "application/pdf",
                    "filename": "x.pdf",
                    "body": {"attachmentId": "att1"},
                },
            ],
        },
    }

    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=1,
        import_content="text",
    )

    mock_fetch.assert_not_called()
    assert len(paths) == 1
    assert Path(paths[0]).name == "Hello.txt"
    assert "attachment(s) also saved" not in Path(paths[0]).read_text(encoding="utf-8")


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"%PDF-1")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_attachments_only_writes_pdf_not_txt(
    mock_list,
    mock_get,
    _mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "msgABC"}], "nextPageToken": None}
    mock_get.return_value = {
        "id": "msgABC",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Zed"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "QQ=="}},
                {
                    "mimeType": "application/pdf",
                    "filename": "doc.pdf",
                    "body": {"attachmentId": "attZ"},
                },
            ],
        },
    }

    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=1,
        import_content="attachments",
    )

    assert len(paths) == 1
    assert Path(paths[0]).name == "doc.pdf"
    first_list_kw = mock_list.call_args_list[0].kwargs
    assert "has:attachment" in (first_list_kw.get("query") or "")


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"%PDF-1.4\n")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_attachments_only_skips_plain_messages_until_file_cap_met(
    mock_list,
    mock_get,
    mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``max_messages`` is attachment files: body-only mail first, then PDF counts toward the cap."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {
        "messages": [{"id": "plain1"}, {"id": "withpdf"}],
        "nextPageToken": None,
    }

    plain = {
        "id": "plain1",
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "Subject", "value": "Hi"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "body": {"data": "QQ=="},
        },
    }
    with_pdf = {
        "id": "withpdf",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Doc"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 2 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "QQ=="}},
                {
                    "mimeType": "application/pdf",
                    "filename": "doc.pdf",
                    "body": {"attachmentId": "attZ"},
                },
            ],
        },
    }

    mock_get.side_effect = lambda _t, mid, **_k: plain if mid == "plain1" else with_pdf

    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=1,
        import_content="attachments",
    )

    assert len(paths) == 1
    assert Path(paths[0]).name == "doc.pdf"
    mock_fetch.assert_called_once()


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"x")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_attachments_only_stops_mid_message_at_file_cap(
    mock_list,
    mock_get,
    mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Three attachments in one message; file cap 2 yields two files and two fetch calls."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "rich"}], "nextPageToken": None}
    mock_get.return_value = {
        "id": "rich",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Pack"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "QQ=="}},
                {
                    "mimeType": "application/pdf",
                    "filename": "a.pdf",
                    "body": {"attachmentId": "att1"},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "b.pdf",
                    "body": {"attachmentId": "att2"},
                },
                {
                    "mimeType": "application/pdf",
                    "filename": "c.pdf",
                    "body": {"attachmentId": "att3"},
                },
            ],
        },
    }

    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=2,
        import_content="attachments",
    )

    assert len(paths) == 2
    assert mock_fetch.call_count == 2


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"x")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_same_attachment_name_two_messages_gets_disambiguated_second_name(
    mock_list,
    mock_get,
    _mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two threads with ``invite.ics`` → first ``invite.ics``, second ``invite__{msg_id}.ics``."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {
        "messages": [{"id": "msgA"}, {"id": "msgB"}],
        "nextPageToken": None,
    }

    def get_msg(_token: str, mid: str, **_kwargs: object) -> dict:
        return {
            "id": mid,
            "payload": {
                "mimeType": "multipart/mixed",
                "headers": [
                    {"name": "Subject", "value": "A"},
                    {"name": "From", "value": "a@b.com"},
                    {"name": "To", "value": "c@d.com"},
                    {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
                ],
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": "QQ=="}},
                    {
                        "mimeType": "text/calendar",
                        "filename": "invite.ics",
                        "body": {"attachmentId": "att1"},
                    },
                ],
            },
        }

    mock_get.side_effect = get_msg

    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=2,
        import_content="attachments",
    )

    names = sorted(Path(p).name for p in paths)
    assert names[0] == "invite.ics"
    assert names[1] == "invite__msgB.ics"


def _minimal_text_message(msg_id: str) -> dict:
    return {
        "id": msg_id,
        "payload": {
            "mimeType": "text/plain",
            "headers": [
                {"name": "Subject", "value": "S"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "body": {"data": "QQ=="},
        },
    }


@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_paginates_across_list_pages_until_message_cap(
    mock_list,
    mock_get,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``users.messages.list`` returns pages of stubs; export continues until ``max_messages``."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.side_effect = [
        {"messages": [{"id": "m1"}, {"id": "m2"}], "nextPageToken": "t1"},
        {"messages": [{"id": "m3"}, {"id": "m4"}], "nextPageToken": "t2"},
        {"messages": [{"id": "m5"}], "nextPageToken": "t3"},
    ]
    mock_get.side_effect = lambda _t, mid, **_k: _minimal_text_message(mid)

    staging = tmp_path / "paginate_staging"
    paths = list(
        gi.iter_gmail_export_file_paths(
            "token",
            query="in:inbox",
            max_messages=5,
            import_content="text",
            staging_root=staging,
        )
    )

    assert len(paths) == 5
    assert all(p[1] == "message_body" for p in paths)
    assert mock_list.call_count == 3
    assert mock_get.call_count == 5


@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_stops_when_list_has_no_next_page_even_with_high_cap(
    mock_list,
    mock_get,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inbox smaller than cap: last ``list`` has no ``nextPageToken``."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.side_effect = [
        {"messages": [{"id": "a"}], "nextPageToken": "t"},
        {"messages": [{"id": "b"}], "nextPageToken": None},
    ]
    mock_get.side_effect = lambda _t, mid, **_k: _minimal_text_message(mid)

    staging = tmp_path / "exhaust_staging"
    paths = list(
        gi.iter_gmail_export_file_paths(
            "token",
            query="in:inbox",
            max_messages=10_000,
            import_content="text",
            staging_root=staging,
        )
    )

    assert len(paths) == 2
    assert all(p[1] == "message_body" for p in paths)
    assert mock_list.call_count == 2


@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_batch_runs_parallel_get_message(
    mock_list,
    mock_get,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A batch of 10 messages issues overlapping ``gmail_get_message`` calls (ThreadPoolExecutor)."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    depth_lock = threading.Lock()
    in_flight = [0]
    max_parallel = [0]

    def slow_get(_t: str, mid: str, **_kwargs: object) -> dict:
        with depth_lock:
            in_flight[0] += 1
            max_parallel[0] = max(max_parallel[0], in_flight[0])
        time.sleep(0.04)
        with depth_lock:
            in_flight[0] -= 1
        return _minimal_text_message(mid)

    mock_get.side_effect = slow_get
    mock_list.return_value = {
        "messages": [{"id": f"m{i}"} for i in range(10)],
        "nextPageToken": None,
    }

    staging = tmp_path / "parallel_batch_staging"
    paths = list(
        gi.iter_gmail_export_file_paths(
            "token",
            query="in:inbox",
            max_messages=10,
            import_content="text",
            staging_root=staging,
        )
    )

    assert len(paths) == 10
    assert all(p[1] == "message_body" for p in paths)
    assert mock_get.call_count == 10
    assert max_parallel[0] >= 2


@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_iter_gmail_export_export_stats_reflects_text_export(
    mock_list,
    mock_get,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "m1"}], "nextPageToken": None}
    mock_get.side_effect = lambda _t, mid, **_k: _minimal_text_message(mid)
    stats: dict[str, int] = {}
    lock = threading.Lock()
    staging = tmp_path / "stats_text_staging"
    paths = list(
        gi.iter_gmail_export_file_paths(
            "token",
            query="in:inbox",
            max_messages=1,
            import_content="text",
            staging_root=staging,
            export_stats=stats,
            export_stats_lock=lock,
        )
    )
    assert len(paths) == 1
    assert paths[0][1] == "message_body"
    assert stats["messages_completed"] == 1
    assert stats["text_files"] == 1
    assert stats["attachment_files"] == 0
    assert stats["attachment_fetch_failures"] == 0
    assert stats["staging_capped"] == 0


@patch("gmail_import.gmail_fetch_attachment_bytes", return_value=b"%PDF-1.4\n")
@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_iter_gmail_export_export_stats_reflects_both_mode(
    mock_list,
    mock_get,
    mock_fetch,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "msgABC"}], "nextPageToken": None}
    mock_get.return_value = {
        "id": "msgABC",
        "payload": {
            "mimeType": "multipart/mixed",
            "headers": [
                {"name": "Subject", "value": "Invoice"},
                {"name": "From", "value": "a@b.com"},
                {"name": "To", "value": "c@d.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
            ],
            "parts": [
                {"mimeType": "text/plain", "body": {"data": "SGkK"}},
                {
                    "mimeType": "application/pdf",
                    "filename": "invoice.pdf",
                    "body": {"attachmentId": "attXYZ"},
                },
            ],
        },
    }
    stats: dict[str, int] = {}
    lock = threading.Lock()
    staging = tmp_path / "stats_both_staging"
    paths = list(
        gi.iter_gmail_export_file_paths(
            "token",
            query="in:inbox",
            max_messages=1,
            import_content="both",
            staging_root=staging,
            export_stats=stats,
            export_stats_lock=lock,
        )
    )
    assert len(paths) == 2
    assert paths[0][1] == "message_body"
    assert paths[1][1] == "attachment"
    assert stats["messages_completed"] == 1
    assert stats["text_files"] == 1
    assert stats["attachment_files"] == 1
    assert stats["attachment_fetch_failures"] == 0
    assert stats["staging_capped"] == 0


@patch("gmail_import.gmail_get_message")
@patch("gmail_import.gmail_list_messages")
def test_export_text_same_subject_two_messages_disambiguates_second_file(
    mock_list,
    mock_get,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two different emails with the same Subject get ``Report.txt`` and ``Report__{id}.txt``."""
    monkeypatch.setattr(gi, "APP_STATE_DIR", tmp_path)
    mock_list.return_value = {"messages": [{"id": "m1"}, {"id": "m2"}], "nextPageToken": None}

    def get_msg(_t: str, mid: str, **_kwargs: object) -> dict:
        d = {
            "id": mid,
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "Subject", "value": "Report"},
                    {"name": "From", "value": "a@b.com"},
                    {"name": "To", "value": "c@d.com"},
                    {"name": "Date", "value": "Mon, 1 Jan 2024 12:00:00 +0000"},
                ],
                "body": {"data": "QQ=="},
            },
        }
        return d

    mock_get.side_effect = get_msg
    paths, _root = gi.export_gmail_messages_to_staging(
        "token",
        query="*",
        max_messages=2,
        import_content="text",
    )
    names = {Path(p).name for p in paths}
    assert len(names) == 2
    assert "Report.txt" in names
    disambig = (names - {"Report.txt"}).pop()
    assert disambig.startswith("Report__m") and disambig.endswith(".txt")
