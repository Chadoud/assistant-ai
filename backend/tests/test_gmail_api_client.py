"""Tests for Gmail REST helpers (mocked HTTP)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from gmail_api_client import (
    attachment_specs_from_payload,
    decode_gmail_body,
    extract_header,
    filter_redundant_body_attachments,
    format_gmail_api_http_error,
    gmail_fetch_attachment_bytes,
    gmail_get_message,
    gmail_list_messages,
    is_file_attachment_part,
)


def test_extract_header():
    headers = [
        {"name": "Subject", "value": "Hello"},
        {"name": "From", "value": "a@b.com"},
    ]
    assert extract_header(headers, "subject") == "Hello"
    assert extract_header(headers, "Missing") == ""


def test_decode_body_plain():
    payload = {"mimeType": "text/plain", "body": {"data": "SGVsbG8="}}  # "Hello"
    assert decode_gmail_body(payload) == "Hello"


def test_decode_body_multipart():
    payload = {
        "mimeType": "multipart/alternative",
        "parts": [
            {"mimeType": "text/html", "body": {"data": "PGI+aGk8L2I+"}},
            {"mimeType": "text/plain", "body": {"data": "aGk="}},  # "hi"
        ],
    }
    assert decode_gmail_body(payload) == "hi"


def test_decode_body_mixed_skips_file_attachment_parts():
    payload = {
        "mimeType": "multipart/mixed",
        "parts": [
            {
                "mimeType": "multipart/alternative",
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": "aGk="}},
                ],
            },
            {
                "mimeType": "application/pdf",
                "filename": "memo.pdf",
                "body": {"attachmentId": "ANGfake"},
            },
        ],
    }
    assert decode_gmail_body(payload) == "hi"


def test_is_file_attachment_part():
    assert is_file_attachment_part(
        {"filename": "a.pdf", "body": {"attachmentId": "x"}}
    )
    assert not is_file_attachment_part({"mimeType": "text/plain", "body": {"data": "QQ=="}})


def test_attachment_specs_from_payload_nested():
    payload = {
        "mimeType": "multipart/mixed",
        "parts": [
            {
                "mimeType": "multipart/alternative",
                "parts": [{"mimeType": "text/plain", "body": {"data": "QQ=="}}],
            },
            {"mimeType": "application/pdf", "filename": "a.pdf", "body": {"attachmentId": "id1"}},
            {"mimeType": "image/png", "filename": "b.png", "body": {"attachmentId": "id2"}},
        ],
    }
    specs = attachment_specs_from_payload(payload)
    assert [(a, f) for a, f, _m in specs] == [("id1", "a.pdf"), ("id2", "b.png")]


def test_attachment_specs_includes_attachment_id_without_filename():
    payload = {
        "mimeType": "multipart/mixed",
        "parts": [
            {
                "mimeType": "application/pdf",
                "filename": "",
                "body": {"attachmentId": "orphan-id"},
            },
        ],
    }
    specs = attachment_specs_from_payload(payload)
    assert len(specs) == 1
    assert specs[0][0] == "orphan-id"
    assert specs[0][0] in specs[0][1] or specs[0][1].endswith(".pdf")


def test_filter_redundant_body_drops_att_txt_when_pdf_present():
    raw = [
        ("a1", "ATT00001.txt", "text/plain"),
        ("a2", "report.pdf", "application/pdf"),
    ]
    out = filter_redundant_body_attachments(raw)
    assert out == [("a2", "report.pdf")]


def test_filter_redundant_body_keeps_only_att_when_nothing_else():
    raw = [("a1", "ATT00001.txt", "text/plain")]
    out = filter_redundant_body_attachments(raw)
    assert out == [("a1", "ATT00001.txt")]


@patch("gmail_api_client.httpx.Client")
def test_gmail_fetch_attachment_bytes(mock_client_cls):
    inner = MagicMock()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"data": "aGk"}  # "hi" without padding
    inner.get.return_value = mock_resp
    mock_client_cls.return_value = _client_cm(inner)

    out = gmail_fetch_attachment_bytes("tok", "mid", "aid")
    assert out == b"hi"
    inner.get.assert_called_once()
    url = inner.get.call_args[0][0]
    assert "messages/mid/attachments/aid" in url


def _client_cm(inner: MagicMock) -> MagicMock:
    cm = MagicMock()
    cm.__enter__.return_value = inner
    cm.__exit__.return_value = None
    return cm


@patch("gmail_api_client.httpx.Client")
def test_gmail_list_messages(mock_client_cls):
    inner = MagicMock()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"messages": [{"id": "m1"}], "nextPageToken": "nxt"}
    inner.get.return_value = mock_resp
    mock_client_cls.return_value = _client_cm(inner)

    out = gmail_list_messages("tok", page_token=None, query="is:unread")
    assert out["messages"][0]["id"] == "m1"
    inner.get.assert_called_once()
    call_kw = inner.get.call_args
    assert call_kw[1]["headers"]["Authorization"] == "Bearer tok"
    assert call_kw[1]["params"]["maxResults"] == 500
    assert call_kw[1]["params"]["q"] == "is:unread"


@patch("gmail_api_client.httpx.Client")
def test_gmail_get_message(mock_client_cls):
    inner = MagicMock()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "id": "m1",
        "payload": {"mimeType": "text/plain", "headers": [], "body": {"data": ""}},
    }
    inner.get.return_value = mock_resp
    mock_client_cls.return_value = _client_cm(inner)

    msg = gmail_get_message("tok", "m1")
    assert msg["id"] == "m1"


@patch("gmail_api_client.httpx.Client")
def test_gmail_get_message_metadata_uses_repeated_metadata_headers(mock_client_cls):
    """Gmail requires repeated metadataHeaders=… keys; a single space-joined value returns no headers."""
    inner = MagicMock()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"id": "m1", "payload": {"headers": []}}
    inner.get.return_value = mock_resp
    mock_client_cls.return_value = _client_cm(inner)

    gmail_get_message(
        "tok",
        "m1",
        message_format="metadata",
        metadata_headers=["From", "Subject", "Date"],
    )
    inner.get.assert_called_once()
    params = inner.get.call_args[1]["params"]
    assert params == [
        ("format", "metadata"),
        ("metadataHeaders", "From"),
        ("metadataHeaders", "Subject"),
        ("metadataHeaders", "Date"),
    ]


def test_format_gmail_api_http_error_google_json_body():
    req = httpx.Request("GET", "https://gmail.googleapis.com/gmail/v1/users/me/messages")
    resp = httpx.Response(
        403,
        request=req,
        json={
            "error": {
                "code": 403,
                "message": "Gmail API has not been used. Enable it in Cloud Console.",
                "errors": [{"domain": "usageLimits", "reason": "accessNotConfigured"}],
            }
        },
    )
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        line = format_gmail_api_http_error(exc)
    assert "403" in line
    assert "accessNotConfigured" in line
    assert "Cloud Console" in line


def test_format_gmail_api_http_error_plain_text():
    req = httpx.Request("GET", "https://example.com")
    resp = httpx.Response(502, request=req, text="bad gateway")
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        line = format_gmail_api_http_error(exc)
    assert "502" in line
    assert "bad gateway" in line


@patch("gmail_api_client.time.sleep", lambda *_a, **_k: None)
@patch("gmail_api_client.httpx.Client")
def test_gmail_list_messages_retries_on_503(mock_client_cls):
    """Transient 503 triggers a second request; no OAuth calls (static token)."""
    inner = MagicMock()
    n = [0]

    def get_impl(*_a, **_k):
        n[0] += 1
        if n[0] == 1:
            r = httpx.Response(503, request=httpx.Request("GET", "https://gmail.googleapis.com/x"))
            raise httpx.HTTPStatusError("e", request=r.request, response=r)
        m = MagicMock()
        m.json.return_value = {"messages": []}
        return m

    inner.get.side_effect = get_impl
    mock_client_cls.return_value = _client_cm(inner)

    out = gmail_list_messages("tok", page_token=None, query="q")
    assert out == {"messages": []}
    assert n[0] == 2
    assert inner.get.call_count == 2
