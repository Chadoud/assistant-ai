"""
Gmail REST API client (list/get messages, decode body).

Adapted from OpenJarvis ``connectors/gmail.py`` (Apache-2.0). Module-level
functions are patchable in tests.
"""

from __future__ import annotations

import base64
import email.utils
import logging
import mimetypes
import random
import re
import time
from collections.abc import Callable, Iterator
from datetime import datetime
from typing import Any, TypeVar

import httpx

_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_MAX_ERROR_DETAIL_CHARS = 2000
logger = logging.getLogger(__name__)

# Long imports: keep going through transient 5xx / 429 / network blips; 401 is handled via OAuth refresh.
_GMAIL_MAX_HTTP_ATTEMPTS = 8
_GMAIL_BACKOFF_BASE_S = 0.4
_GMAIL_BACKOFF_MAX_S = 60.0

T = TypeVar("T")


def format_gmail_api_http_error(exc: httpx.HTTPStatusError) -> str:
    """
    Build a user-facing message from a failed Gmail REST response.

    Google returns JSON with ``error.message`` (often includes a Console link);
    the app previously only exposed the status code (e.g. 403).
    """
    r = exc.response
    status = r.status_code
    raw = (r.text or "").strip()
    if not raw:
        return f"Gmail API returned {status}."

    try:
        data = r.json()
    except Exception:
        tail = raw if len(raw) <= 600 else raw[:600] + "…"
        return f"Gmail API error ({status}): {tail}"

    err = data.get("error")
    if isinstance(err, str):
        line = f"Gmail API error ({status}): {err}"
    elif isinstance(err, dict):
        msg = str(err.get("message") or "").strip()
        reasons = err.get("errors")
        reason = ""
        if isinstance(reasons, list) and reasons and isinstance(reasons[0], dict):
            reason = str(reasons[0].get("reason") or "").strip()
        if msg and reason:
            line = f"Gmail API ({status}, {reason}): {msg}"
        elif msg:
            line = f"Gmail API ({status}): {msg}"
        elif reason:
            line = f"Gmail API ({status}): {reason}"
        else:
            line = f"Gmail API error ({status})."
    else:
        line = f"Gmail API error ({status})."

    if len(line) > _MAX_ERROR_DETAIL_CHARS:
        return line[: _MAX_ERROR_DETAIL_CHARS - 1] + "…"
    return line


def _gmail_transient_http_status(code: int) -> bool:
    """2nd-chance HTTP status codes (not 401; that is handled via OAuth reauth)."""
    return code in (408, 429) or 500 <= code <= 504


def _sleep_gmail_backoff(attempt: int, response: httpx.Response | None) -> None:
    if response is not None:
        ra = (response.headers.get("Retry-After") or "").strip()
        if ra:
            try:
                wait = min(float(ra), 120.0)
                if wait > 0:
                    time.sleep(wait)
                    return
            except ValueError:
                pass
    cap = min(_GMAIL_BACKOFF_MAX_S, _GMAIL_BACKOFF_BASE_S * (2**attempt))
    jitter = random.uniform(0, cap * 0.2)
    time.sleep(cap + jitter)


def execute_gmail_get_with_resilience(
    get_token: Callable[[], str],
    operation: Callable[[str], T],
    *,
    what: str = "gmail",
) -> T:
    """
    Run a Gmail API GET, retrying transport failures and transient HTTP status codes.

    On 401, forces an OAuth access-token refresh (handles expired tokens mid long-running import)
    and retries that logical call once. Transient 5xx/429/408 use exponential backoff. Further 401
    after a forced token refresh re-raises (e.g. revoked app).
    """
    from gmail_google_oauth import get_valid_access_token  # local import: tests may patch

    pending_401_reauth = False
    reauth_just_tried = False
    for attempt in range(_GMAIL_MAX_HTTP_ATTEMPTS):
        try:
            if pending_401_reauth:
                token = get_valid_access_token(force_refresh=True)
                pending_401_reauth = False
                reauth_just_tried = True
            else:
                token = get_token()
                reauth_just_tried = False
            return operation(token)
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            if code == 401:
                if reauth_just_tried:
                    raise
                pending_401_reauth = True
                logger.warning(
                    "%s HTTP 401; will refresh OAuth access token and retry (attempt %s)",
                    what,
                    attempt + 1,
                )
                time.sleep(0.2)
                continue
            if _gmail_transient_http_status(code) and attempt < _GMAIL_MAX_HTTP_ATTEMPTS - 1:
                logger.warning(
                    "%s HTTP %s; retrying in backoff (attempt %s)",
                    what,
                    code,
                    attempt + 1,
                )
                _sleep_gmail_backoff(attempt, exc.response)
                continue
            raise
        except httpx.RequestError as exc:
            if attempt < _GMAIL_MAX_HTTP_ATTEMPTS - 1:
                logger.warning(
                    "%s request error: %s; retrying (attempt %s)", what, exc, attempt + 1
                )
                _sleep_gmail_backoff(attempt, None)
                continue
            raise


def gmail_list_messages(
    token: str,
    *,
    page_token: str | None = None,
    query: str = "",
    max_results: int = 500,
    get_token: Callable[[], str] | None = None,
) -> dict[str, Any]:
    """
    List message ids for ``users.messages.list``.

    ``max_results`` is passed as ``maxResults`` (Gmail allows 1–500; default API is 100).
    Use 500 for large imports so “fetch all” needs fewer round trips.

    ``get_token`` defaults to ``lambda: token``. Use :func:`gmail_google_oauth.get_valid_access_token`
    from long-running imports (see :func:`gmail_import.iter_gmail_export_file_paths`) so retried
    requests pick up a freshly refreshed access token from disk.
    """
    params: dict[str, str | int] = {}
    if page_token:
        params["pageToken"] = page_token
    if query:
        params["q"] = query
    mr = max(1, min(500, int(max_results)))
    params["maxResults"] = mr
    getter = get_token if get_token is not None else (lambda: token)

    def one_list(tok: str) -> dict[str, Any]:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{_GMAIL_API_BASE}/messages",
                headers={"Authorization": f"Bearer {tok}"},
                params=params,
            )
            resp.raise_for_status()
            return resp.json()

    return execute_gmail_get_with_resilience(
        getter,
        one_list,
        what="gmail_list_messages",
    )


def gmail_get_user_label(
    token: str,
    label_id: str,
    *,
    get_token: Callable[[], str] | None = None,
) -> dict[str, Any]:
    """
    Return a label resource (``users.labels.get``) including ``messagesTotal`` and ``threadsTotal``.

    Use ``id`` values like ``INBOX`` or ``SPAM``; same resilience as other Gmail calls.
    """
    getter = get_token if get_token is not None else (lambda: token)
    lid = str(label_id or "").strip()
    if not lid:
        raise ValueError("label_id is required")

    def one_label(tok: str) -> dict[str, Any]:
        from urllib.parse import quote

        with httpx.Client(timeout=30.0) as client:
            r = client.get(
                f"{_GMAIL_API_BASE}/labels/{quote(lid, safe='')}",
                headers={"Authorization": f"Bearer {tok}"},
            )
            r.raise_for_status()
            return r.json()

    return execute_gmail_get_with_resilience(
        getter,
        one_label,
        what=f"gmail_get_user_label {label_id}",
    )


def gmail_get_message(
    token: str,
    msg_id: str,
    *,
    message_format: str = "full",
    metadata_headers: list[str] | None = None,
    get_token: Callable[[], str] | None = None,
) -> dict[str, Any]:
    getter = get_token if get_token is not None else (lambda: token)
    fmt = str(message_format or "full").strip() or "full"

    def one_get(tok: str) -> dict[str, Any]:
        # Gmail expects *repeated* query keys: metadataHeaders=From&metadataHeaders=Subject
        # A single space-joined value is ignored → empty payload headers (no subject/from/date).
        if metadata_headers and fmt == "metadata":
            params: list[tuple[str, str]] = [("format", fmt)]
            for h in metadata_headers:
                h_clean = str(h).strip()
                if h_clean:
                    params.append(("metadataHeaders", h_clean))
        else:
            params = {"format": fmt}
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{_GMAIL_API_BASE}/messages/{msg_id}",
                headers={"Authorization": f"Bearer {tok}"},
                params=params,
            )
            resp.raise_for_status()
            return resp.json()

    return execute_gmail_get_with_resilience(
        getter,
        one_get,
        what=f"gmail_get_message {msg_id[:8]}",
    )


# Outlook / Exchange often re-exports the message body as a downloadable "attachment".
_BODY_ATTACHMENT_NAME_RE = re.compile(
    r"^(ATT\d+|attachment\d*|noname|unnamed(?:\s*attachment)?)(\.(txt|htm|html))?$",
    re.IGNORECASE,
)


def is_file_attachment_part(part: dict[str, Any]) -> bool:
    """
    True when this MIME part is stored separately and fetched via ``attachments.get``.

    Inline HTML bodies use ``body.data``; real attachments use ``attachmentId`` + ``filename``.
    """
    body = part.get("body")
    if not isinstance(body, dict):
        return False
    aid = str(body.get("attachmentId") or "").strip()
    fn = str(part.get("filename") or "").strip()
    return bool(aid and fn)


def _synthetic_attachment_filename(part: dict[str, Any], attachment_id: str) -> str:
    """Gmail sometimes omits ``filename``; still fetchable via ``attachmentId``."""
    mt = str(part.get("mimeType", "") or "").split(";")[0].strip().lower()
    guessed = mimetypes.guess_extension(mt) if mt else None
    ext = guessed if guessed else ".bin"
    tail = re.sub(r"[^A-Za-z0-9_-]", "", attachment_id)[-10:] or "file"
    return f"gmail-part-{tail}{ext}"


def iter_mime_parts(root: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Depth-first walk of a Gmail message ``payload`` MIME tree."""
    yield root
    for child in root.get("parts") or []:
        if isinstance(child, dict):
            yield from iter_mime_parts(child)


def attachment_specs_from_payload(payload: dict[str, Any]) -> list[tuple[str, str, str]]:
    """
    Collect ``(attachment_id, filename, mime_type)`` for every Gmail part with ``attachmentId``.

    Parts may omit ``filename``; a stable synthetic name is used so bytes can still be fetched.
    Order is depth-first; duplicates with the same id+name appear once.
    """
    out: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for part in iter_mime_parts(payload):
        body = part.get("body")
        if not isinstance(body, dict):
            continue
        aid = str(body.get("attachmentId") or "").strip()
        if not aid:
            continue
        fn = str(part.get("filename") or "").strip()
        if not fn:
            fn = _synthetic_attachment_filename(part, aid)
        mime = str(part.get("mimeType", "") or "")
        key = (aid, fn)
        if key in seen:
            continue
        seen.add(key)
        out.append((aid, fn, mime))
    return out


def _mime_major(mime: str) -> str:
    return (mime or "").split(";")[0].strip().lower()


def _is_likely_duplicate_body_attachment(mime: str, filename: str) -> bool:
    """
    True when this part is usually the message body surfaced again as a fake attachment
    (common with Outlook/Exchange ``ATT00001.txt``).
    """
    leaf = filename.replace("\\", "/").split("/")[-1].strip()
    if not leaf:
        return False
    if _mime_major(mime) not in ("text/plain", "text/html"):
        return False
    return bool(_BODY_ATTACHMENT_NAME_RE.match(leaf))


def filter_redundant_body_attachments(specs: list[tuple[str, str, str]]) -> list[tuple[str, str]]:
    """
    Drop body-duplicated ``text/plain`` / ``text/html`` parts when real files are also present.

    If every part looks like noise, returns all specs unchanged (single attachment is kept).
    """
    if len(specs) <= 1:
        return [(a, f) for a, f, _m in specs]
    noise_flags = [_is_likely_duplicate_body_attachment(m, f) for _a, f, m in specs]
    if not any(noise_flags):
        return [(a, f) for a, f, _m in specs]
    if all(noise_flags):
        return [(a, f) for a, f, _m in specs]
    return [(a, f) for (a, f, m), is_n in zip(specs, noise_flags) if not is_n]


def gmail_fetch_attachment_bytes(
    token: str,
    message_id: str,
    attachment_id: str,
    *,
    get_token: Callable[[], str] | None = None,
) -> bytes:
    """
    Download raw attachment bytes (Gmail ``users.messages.attachments.get``).

    :raises httpx.HTTPStatusError: API failure after retries.
    """
    getter = get_token if get_token is not None else (lambda: token)

    def one_fetch(tok: str) -> bytes:
        with httpx.Client(timeout=120.0) as client:
            resp = client.get(
                f"{_GMAIL_API_BASE}/messages/{message_id}/attachments/{attachment_id}",
                headers={"Authorization": f"Bearer {tok}"},
            )
            resp.raise_for_status()
            raw = resp.json().get("data")
        if not isinstance(raw, str) or not raw.strip():
            return b""
        padded = raw + "=" * (-len(raw) % 4)
        try:
            return base64.urlsafe_b64decode(padded)
        except Exception:
            return b""

    return execute_gmail_get_with_resilience(
        getter,
        one_fetch,
        what="gmail_fetch_attachment_bytes",
    )


def extract_header(headers: list[dict[str, str]], name: str) -> str:
    name_lower = name.lower()
    for h in headers:
        if str(h.get("name", "")).lower() == name_lower:
            return str(h.get("value", ""))
    return ""


def decode_gmail_body(payload: dict[str, Any]) -> str:
    mime_type: str = str(payload.get("mimeType", "") or "")

    if mime_type.startswith("multipart/"):
        parts: list[dict[str, Any]] = payload.get("parts") or []
        for part in parts:
            if not isinstance(part, dict):
                continue
            if is_file_attachment_part(part):
                continue
            if str(part.get("mimeType", "")).startswith("text/plain"):
                return decode_gmail_body(part)
        for part in parts:
            if not isinstance(part, dict) or is_file_attachment_part(part):
                continue
            decoded = decode_gmail_body(part)
            if decoded.strip():
                return decoded
        return ""

    body_obj = payload.get("body")
    body_data = ""
    if isinstance(body_obj, dict):
        body_data = str(body_obj.get("data", "") or "")

    if not body_data:
        return ""

    padded = body_data + "=" * (-len(body_data) % 4)
    try:
        return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return ""


def parse_email_date(date_str: str) -> datetime:
    if not date_str:
        return datetime.now()
    try:
        return email.utils.parsedate_to_datetime(date_str)
    except Exception:
        return datetime.now()
