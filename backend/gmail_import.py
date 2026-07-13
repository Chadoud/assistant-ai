"""
Export Gmail messages to staged ``.txt`` files for the existing sort pipeline.
"""

from __future__ import annotations

import concurrent.futures
import logging
import pathlib
import queue
import re
import threading
import uuid
from collections.abc import Callable, Iterator
from typing import Any, Literal

import httpx

from constants import (
    APP_STATE_DIR,
    GMAIL_EXACT_LIST_COUNT_MAX_PAGES,
    GMAIL_EXPORT_MAX_ATTACHMENTS_PER_MESSAGE,
    GMAIL_EXPORT_MAX_BYTES_PER_ATTACHMENT,
    GMAIL_EXPORT_MAX_MESSAGES,
    GMAIL_EXPORT_MAX_STAGING_BYTES,
    GMAIL_MESSAGE_FETCH_BATCH_SIZE,
    GMAIL_MESSAGE_PREFETCH_QUEUE_MAX,
)
from gmail_api_client import (
    attachment_specs_from_payload,
    decode_gmail_body,
    extract_header,
    filter_redundant_body_attachments,
    format_gmail_api_http_error,
    gmail_fetch_attachment_bytes,
    gmail_get_message,
    gmail_get_user_label,
    gmail_list_messages,
    parse_email_date,
)

logger = logging.getLogger(__name__)

# Characters invalid in Windows filenames; keep all other bytes (e.g. ":" in names) except path/control.
_WIN_FILENAME_FORBIDDEN = re.compile(r'[<>:"/\\|?\x00-\x1f]')
_WIN_RESERVED_STEMS = frozenset(
    {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
)

GmailImportContentMode = Literal["text", "attachments", "both"]
"""Gmail staging kind: exported message body .txt vs a downloaded attachment file."""
GmailStagedPart = Literal["message_body", "attachment"]

# Gmail ``users.messages.list`` often returns no messages for ``in:inbox category:primary`` while
# the Primary tab still shows mail (tabs off, labeling). Inbox minus other tabs matches Primary reliably.
GMAIL_QUERY_INBOX_PRIMARY_TAB = (
    "in:inbox -category:social -category:promotions -category:updates -category:forums"
)
# Default Gmail import scope: entire Inbox (all category tabs). Legacy clients sent Primary-tab
# shims and bare ``category:primary``; those normalize here so list results match the Inbox folder.
GMAIL_QUERY_DEFAULT_INBOX = "in:inbox"


def canonical_gmail_list_query(query: str) -> str:
    """
    Normalize legacy Primary-only tokens to full Inbox (``in:inbox``).

    Older builds used ``category:primary`` or ``GMAIL_QUERY_INBOX_PRIMARY_TAB`` so the Gmail API
    would list the Primary slice reliably; the product default is now the whole Inbox.
    """
    raw = (query or "").strip()
    if not raw:
        return GMAIL_QUERY_DEFAULT_INBOX
    norm = " ".join(raw.lower().split())
    primary_tab_norm = " ".join(GMAIL_QUERY_INBOX_PRIMARY_TAB.lower().split())
    if norm in ("category:primary", "in:inbox category:primary", primary_tab_norm):
        return GMAIL_QUERY_DEFAULT_INBOX
    return raw


def gmail_list_query_for_import(query: str, import_content: str) -> str:
    """
    Build the ``q`` string passed to ``users.messages.list`` for export.

    For ``attachments`` mode, append Gmail's ``has:attachment`` so list counts and stubs align
    with messages that can yield attachment files (see ``resultSizeEstimate`` preflight).
    """
    q = (query or "").strip()
    if (import_content or "").strip() != "attachments":
        return q
    lower = q.lower()
    if re.search(r"(?<!\w)has:attachment\b", lower):
        return q
    return f"{q} has:attachment".strip()


def refine_result_size_estimate_value(
    raw: Any,
    *,
    import_content: str,
    max_messages: int,
) -> int | None:
    """
    Turn ``resultSizeEstimate`` from any ``users.messages.list`` response into a number we store
    on the job (same rules as the preflight :func:`estimate_gmail_messages_to_process`).
    """
    if not isinstance(raw, int) or raw < 0:
        return None
    if (import_content or "").strip() == "attachments":
        return raw
    cap = max(1, int(max_messages))
    return min(raw, cap)


def estimate_gmail_messages_to_process(
    access_token: str,
    *,
    query: str,
    import_content: str,
    max_messages: int,
) -> int | None:
    """
    One ``users.messages.list`` call (``maxResults=1``) to read ``resultSizeEstimate`` for the
    same ``q`` used by :func:`iter_gmail_export_file_paths`.

    For ``attachments`` import, ``max_messages`` limits **attachment files** during export, not
    Gmail messages, so the estimate is **not** clamped by that value (Gmail still reports matching
    messages).

    For ``text`` / ``both``, returns ``min(estimate, max_messages)`` when Gmail supplies a
    non-negative integer; else ``None``. The value is an **estimate**, not an exact count.
    """
    base = canonical_gmail_list_query(query)
    list_q = gmail_list_query_for_import(base, import_content)
    try:
        resp = gmail_list_messages(access_token, page_token=None, query=list_q or "", max_results=1)
    except (httpx.HTTPError, ValueError, OSError):
        return None
    raw = resp.get("resultSizeEstimate")
    return refine_result_size_estimate_value(
        raw, import_content=import_content, max_messages=max_messages
    )


def _normalize_gmail_list_q_key(list_q: str) -> str:
    return " ".join((list_q or "").strip().lower().split())


def _count_list_query_message_pages(
    get_token: Callable[[], str],
    list_q: str,
) -> int:
    """
    Exact number of message IDs returned by the same list ``q`` the exporter will use, by paging
    with ``maxResults=500`` until there is no ``nextPageToken``.
    """
    total = 0
    page_token: str | None = None
    max_pages = int(GMAIL_EXACT_LIST_COUNT_MAX_PAGES)
    for _ in range(max_pages):
        resp = gmail_list_messages(
            "",
            page_token=page_token,
            query=list_q,
            max_results=500,
            get_token=get_token,
        )
        part = list(resp.get("messages") or [])
        total += len(part)
        raw_next = str(resp.get("nextPageToken") or "").strip()
        if not raw_next:
            return total
        page_token = raw_next
        if not part:
            return total
    logger.warning(
        "gmail_list_query_page_count_capped list_q=%s", _truncate_gmail_query_for_log(list_q, 100)
    )
    return total


def _apply_max_messages_to_count_display(n: int, import_content: str, max_messages: int) -> int:
    """
    For body export modes, clamp to the job cap so the total matches the planned run size.
    Attachments mode keeps the message count (per-job cap is on attachment *files*).
    """
    if (import_content or "").strip() == "attachments":
        return n
    cap = max(1, int(max_messages))
    if cap >= GMAIL_EXPORT_MAX_MESSAGES - 1:
        return n
    return min(n, cap)


def resolve_gmail_import_message_count(
    access_token: str,
    *,
    query: str,
    import_content: str,
    max_messages: int,
    get_token: Callable[[], str] | None = None,
) -> int | None:
    """
    Exact number of messages matching the same list ``q`` the exporter will use, or None on failure.

    Plain ``in:inbox`` and ``in:spam`` (after canonicalization, without extra operators) use
    :func:`gmail_get_user_label` (``messagesTotal``). All other shapes — including
    ``in:anywhere`` (“All mail”), ``has:attachment`` variants, and compound ``OR`` queries — page
    through ``users.messages.list`` so the number matches the export, not Google’s
    ``resultSizeEstimate`` (which is often too low, e.g. 501 for tens of thousands of messages).
    """
    get_tok = get_token if get_token is not None else (lambda: access_token)
    base = canonical_gmail_list_query(query)
    list_q = gmail_list_query_for_import(base, str(import_content))
    nkey = _normalize_gmail_list_q_key(list_q)

    if nkey == "in:inbox":
        try:
            lab = gmail_get_user_label("", "INBOX", get_token=get_tok)
            mtot = lab.get("messagesTotal")
            if isinstance(mtot, int) and mtot >= 0:
                return _apply_max_messages_to_count_display(
                    mtot, str(import_content), int(max_messages)
                )
        except (httpx.HTTPError, ValueError, OSError):
            logger.debug("gmail_inbox_label_count_failed", exc_info=True)

    if nkey == "in:spam":
        try:
            lab = gmail_get_user_label("", "SPAM", get_token=get_tok)
            mtot = lab.get("messagesTotal")
            if isinstance(mtot, int) and mtot >= 0:
                return _apply_max_messages_to_count_display(
                    mtot, str(import_content), int(max_messages)
                )
        except (httpx.HTTPError, ValueError, OSError):
            logger.debug("gmail_spam_label_count_failed", exc_info=True)

    try:
        n = _count_list_query_message_pages(get_tok, list_q or "")
        return _apply_max_messages_to_count_display(n, str(import_content), int(max_messages))
    except (httpx.HTTPError, ValueError, OSError) as e:
        logger.info("gmail_paging_count_failed: %s", e)
        return None


def _body_text_leaf_from_subject(subject: str, msg_id: str) -> str:
    """
    Human-readable ``.txt`` name from the email Subject (RFC 5322 "Subject" field), not the body.
    If Gmail sends no subject (or it becomes empty after trimming), we use a stable
    ``No-subject__{message_id}`` name so the file is unique and valid on all platforms.
    """
    raw = " ".join((subject or "").replace("\n", " ").replace("\r", " ").split()).strip()
    if not raw or raw in (".", ".."):
        clean = re.sub(r"[^A-Za-z0-9_-]", "", (msg_id or "").strip()) or "message"
        return f"No-subject__{clean}.txt"
    stem = _WIN_FILENAME_FORBIDDEN.sub("_", raw)
    stem = stem.rstrip(" .") or "email"
    if len(stem) > 150:
        stem = stem[:150]
    stem_u = stem.upper()
    if stem_u in _WIN_RESERVED_STEMS:
        stem = f"_{stem}"
    return f"{stem}.txt"


def _unique_staging_leaf_against_id(
    staging_root: pathlib.Path,
    leaf: str,
    msg_id: str,
) -> pathlib.Path:
    """
    Reserve ``staging_root/leaf`` if free; else ``stem__{msg_id}`` suffix (then ``__n``),
    same as attachment disambiguation.
    """
    primary = staging_root / leaf
    if not primary.is_file():
        return primary
    p = pathlib.Path(leaf)
    ext = p.suffix or ""
    stem = (p.stem or "file").strip() or "file"
    clean_id = re.sub(r"[^A-Za-z0-9_-]", "", (msg_id or "")) or "id"
    disambig = staging_root / f"{stem}__{clean_id}{ext}"
    if not disambig.is_file():
        return disambig
    n = 1
    while True:
        alt = staging_root / f"{stem}__{clean_id}__{n}{ext}"
        if not alt.is_file():
            return alt
        n += 1


def _footer_attachment_label(display_filename: str) -> str:
    """Single-line label for the body footer; avoids breaking the exported ``.txt`` layout."""
    leaf = display_filename.replace("\\", "/").split("/")[-1].strip()
    return " ".join(leaf.replace("\n", " ").replace("\r", " ").split())[:200] or "attachment"


def _filesystem_safe_attachment_leaf(raw_name: str, *, max_len: int = 200) -> str:
    """
    Use Gmail's attachment filename with only cross-platform fixes: no path segments,
    no Windows-forbidden characters, no trailing dot/space, no reserved device names.
    """
    leaf = raw_name.replace("\\", "/").split("/")[-1].strip()
    if not leaf or leaf in (".", ".."):
        return "attachment.bin"
    leaf = _WIN_FILENAME_FORBIDDEN.sub("_", leaf)
    leaf = leaf.rstrip(" .") or "attachment.bin"
    path_obj = pathlib.Path(leaf)
    stem_upper = (path_obj.stem or "file").upper().rstrip(".")
    if stem_upper in _WIN_RESERVED_STEMS:
        leaf = f"_{leaf}"
    if len(leaf) > max_len:
        suf = path_obj.suffix[:20]
        base = (path_obj.stem or "file")[: max(1, max_len - len(suf) - 1)]
        leaf = f"{base}{suf}"[:max_len]
    return leaf


def _attachment_footer_lines(specs: list[tuple[str, str]]) -> str:
    """``specs`` are ``(attachment_id, display_filename)`` for files actually saved."""
    if not specs:
        return ""
    shown = [_footer_attachment_label(fn) for _, fn in specs[:12]]
    tail = "\n…" if len(specs) > 12 else ""
    joined = ", ".join(shown)
    return (
        f"\n\n---\n"
        f"This message has {len(specs)} attachment(s) also saved next to this file for sorting: "
        f"{joined}{tail}\n"
    )


def _truncate_gmail_query_for_log(q: str, max_len: int = 160) -> str:
    """Gmail search strings for logs only (no tokens or message bodies)."""
    s = (q or "").strip().replace("\n", " ")
    if len(s) <= max_len:
        return s
    return f"{s[: max_len - 3]}..."


def _unique_attachment_path(
    staging_root: pathlib.Path,
    msg_id: str,
    display_filename: str,
) -> pathlib.Path:
    """
    Prefer Gmail's attachment ``filename``; if that path already exists in staging,
    suffix with ``__{msg_id}`` (then ``__{msg_id}__n``) so names stay readable.
    """
    safe_leaf = _filesystem_safe_attachment_leaf(display_filename)
    return _unique_staging_leaf_against_id(staging_root, safe_leaf, msg_id)


def _publish_gmail_export_stats(
    state: _GmailExportRunState,
    export_stats: dict[str, int],
    export_stats_lock: threading.Lock | None,
) -> None:
    """Copy ``state`` counters into ``export_stats`` (optional lock for cross-thread reads)."""
    with state.lock:
        messages_completed = state.fetched
        text_files = state.text_files_written
        attachment_files = state.attachment_files_written
        fetch_fail = state.attachment_fetch_failures
        staging_capped = 1 if state.staging_cap_hit else 0
    if export_stats_lock is not None:
        with export_stats_lock:
            export_stats["messages_completed"] = messages_completed
            export_stats["text_files"] = text_files
            export_stats["attachment_files"] = attachment_files
            export_stats["attachment_fetch_failures"] = fetch_fail
            export_stats["staging_capped"] = staging_capped
    else:
        export_stats["messages_completed"] = messages_completed
        export_stats["text_files"] = text_files
        export_stats["attachment_files"] = attachment_files
        export_stats["attachment_fetch_failures"] = fetch_fail
        export_stats["staging_capped"] = staging_capped


class _GmailExportRunState:
    """Mutable counters for a single Gmail export run (feeder thread + worker pool)."""

    __slots__ = (
        "lock",
        "total_bytes",
        "files_written",
        "fetched",
        "text_files_written",
        "attachment_files_written",
        "attachment_fetch_failures",
        "staging_cap_hit",
        "cap",
        "attachment_file_cap",
    )

    def __init__(self, *, cap: int, import_content: GmailImportContentMode) -> None:
        self.lock = threading.Lock()
        self.total_bytes = 0
        self.files_written = 0
        self.fetched = 0
        self.text_files_written = 0
        self.attachment_files_written = 0
        self.attachment_fetch_failures = 0
        self.staging_cap_hit = False
        self.cap = max(1, int(cap))
        self.attachment_file_cap = import_content == "attachments"

    def export_cap_reached(self) -> bool:
        """True when staging is full or the user cap is satisfied (messages vs attachment files)."""
        if self.staging_cap_hit:
            return True
        if self.attachment_file_cap:
            return self.files_written >= self.cap
        return self.fetched >= self.cap


def _gmail_export_one_message(
    get_access_token: Callable[[], str],
    msg_id: str,
    staging_root: pathlib.Path,
    import_content: GmailImportContentMode,
    state: _GmailExportRunState,
) -> list[tuple[str, GmailStagedPart]]:
    """
    Download one message (``users.messages.get`` outside the write lock), then write body
    and/or attachments under ``state.lock`` so staging byte totals stay consistent.

    Returns ``(absolute_path, part)`` so consumers can treat body text and attachment files
    separately (e.g. review columns, CSV) when ``import_content`` is ``both``.
    """
    out_paths: list[tuple[str, GmailStagedPart]] = []
    # First positional token is unused when ``get_token`` is set (resilience + OAuth refresh on 401).
    msg = gmail_get_message("", msg_id, get_token=get_access_token)
    include_text = import_content in ("text", "both")
    include_attachments = import_content in ("attachments", "both")

    with state.lock:
        if state.staging_cap_hit:
            return out_paths
        payload: dict = msg.get("payload") or {}
        headers_raw = payload.get("headers") or []
        headers: list[dict[str, str]] = [
            {"name": str(h.get("name", "")), "value": str(h.get("value", ""))}
            for h in headers_raw
            if isinstance(h, dict)
        ]

        from_h = extract_header(headers, "From")
        to_h = extract_header(headers, "To")
        subject = extract_header(headers, "Subject")
        date_h = extract_header(headers, "Date")
        body = decode_gmail_body(payload)
        ts = parse_email_date(date_h)
        att_specs_raw = attachment_specs_from_payload(payload)
        att_specs_pairs = filter_redundant_body_attachments(att_specs_raw)

        if include_text:
            footer = (
                _attachment_footer_lines(att_specs_pairs)
                if import_content == "both" and include_attachments and att_specs_pairs
                else ""
            )
            text = (
                f"From: {from_h}\n"
                f"To: {to_h}\n"
                f"Date: {date_h}\n"
                f"Subject: {subject}\n"
                f"Gmail-Message-Id: {msg_id}\n"
                f"Parsed-Timestamp: {ts.isoformat()}\n"
                f"\n"
                f"{body}"
                f"{footer}"
            )
            raw_bytes = text.encode("utf-8", errors="replace")
            if state.total_bytes + len(raw_bytes) > GMAIL_EXPORT_MAX_STAGING_BYTES:
                state.staging_cap_hit = True
                return out_paths
            dest = _unique_staging_leaf_against_id(
                staging_root,
                _body_text_leaf_from_subject(subject, msg_id),
                msg_id,
            )
            dest.write_bytes(raw_bytes)
            resolved = str(dest.resolve())
            state.total_bytes += len(raw_bytes)
            state.files_written += 1
            state.text_files_written += 1
            out_paths.append((resolved, "message_body"))

        if include_attachments and not state.staging_cap_hit:
            att_count = 0
            for aid, att_name in att_specs_pairs:
                if att_count >= GMAIL_EXPORT_MAX_ATTACHMENTS_PER_MESSAGE:
                    break
                if state.attachment_file_cap and state.files_written >= state.cap:
                    break
                try:
                    blob = gmail_fetch_attachment_bytes("", msg_id, aid, get_token=get_access_token)
                except httpx.HTTPStatusError as exc:
                    state.attachment_fetch_failures += 1
                    logger.warning(
                        "gmail_fetch_attachment_failed msg_id=%s attachment_id=%s detail=%s",
                        msg_id,
                        aid,
                        format_gmail_api_http_error(exc),
                    )
                    continue
                if not blob or len(blob) > GMAIL_EXPORT_MAX_BYTES_PER_ATTACHMENT:
                    continue
                if state.total_bytes + len(blob) > GMAIL_EXPORT_MAX_STAGING_BYTES:
                    state.staging_cap_hit = True
                    break
                att_dest = _unique_attachment_path(staging_root, msg_id, att_name)
                try:
                    att_dest.write_bytes(blob)
                except OSError:
                    continue
                resolved = str(att_dest.resolve())
                state.total_bytes += len(blob)
                att_count += 1
                state.files_written += 1
                state.attachment_files_written += 1
                out_paths.append((resolved, "attachment"))
                if state.attachment_file_cap and state.files_written >= state.cap:
                    break

        state.fetched += 1
        return out_paths


_GMAIL_EXPORT_QUEUE_SENTINEL = object()


def iter_gmail_export_file_paths(
    access_token: str,
    *,
    query: str,
    max_messages: int,
    import_content: GmailImportContentMode,
    staging_root: pathlib.Path,
    get_access_token: Callable[[], str] | None = None,
    export_stats: dict[str, int] | None = None,
    export_stats_lock: threading.Lock | None = None,
    on_message_committed_no_paths: Callable[[], None] | None = None,
    on_list_page: Callable[[dict[str, Any]], None] | None = None,
) -> Iterator[tuple[str, GmailStagedPart]]:
    """
    Fetch Gmail messages into ``staging_root`` and **yield** ``(path, part)`` for each staged file
    (``message_body`` vs ``attachment``) as it is written.

    For ``import_content="attachments"``, ``max_messages`` is the maximum number of **attachment
    files** saved (messages without attachments are skipped toward that count until enough files are
    written). For ``text`` / ``both``, it is the maximum number of **messages** processed.

    Message bodies are fetched in parallel batches (see ``GMAIL_MESSAGE_FETCH_BATCH_SIZE``) for
    text/both; attachments-only uses batch size 1 so the file cap is not exceeded by parallel work.

    When ``export_stats`` is set, it is updated after each processed message with keys
    ``messages_completed``, ``text_files``, ``attachment_files``,
    ``attachment_fetch_failures`` (Gmail API errors per attachment), and
    ``staging_capped`` (0 or 1) (use ``export_stats_lock`` when another thread reads the dict).

    ``on_message_committed_no_paths`` runs in the feeder thread after a message is fully processed
    but produced **zero** staged paths (so consumers that only react to path yields still see
    updated ``export_stats``).

    ``on_list_page`` runs in the feeder thread after each ``users.messages.list`` response (the raw
    JSON dict) so the job can refresh ``resultSizeEstimate`` without a separate API call.

    Set ``get_access_token`` to :func:`gmail_google_oauth.get_valid_access_token` for long runs so
    the HTTP client re-authenticates and retries on transient network errors (OAuth refresh on 401);
    if omitted, ``access_token`` is reused for the whole import (tests / short preflight only).
    """
    token_getter: Callable[[], str] = (
        get_access_token if get_access_token is not None else (lambda: access_token)
    )
    cap = max(1, int(max_messages))
    batch_size = max(1, int(GMAIL_MESSAGE_FETCH_BATCH_SIZE))
    if import_content == "attachments":
        batch_size = 1
    qmax = max(int(GMAIL_MESSAGE_PREFETCH_QUEUE_MAX), batch_size)
    staging_root.mkdir(parents=True, exist_ok=True)
    query_canon = canonical_gmail_list_query(query)
    list_q = gmail_list_query_for_import(query_canon, str(import_content))
    state = _GmailExportRunState(cap=cap, import_content=import_content)
    if export_stats is not None:
        export_stats["messages_completed"] = 0
        export_stats["text_files"] = 0
        export_stats["attachment_files"] = 0
        export_stats["attachment_fetch_failures"] = 0
        export_stats["staging_capped"] = 0
    list_pages_for_log = 0
    more_pages_for_log = False
    out_q: queue.Queue[str | object] = queue.Queue(maxsize=qmax)
    feeder_exc: list[BaseException] = []

    def feeder() -> None:
        nonlocal list_pages_for_log, more_pages_for_log
        page_token: str | None = None
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=batch_size) as pool:
                while not state.export_cap_reached():
                    list_pages_for_log += 1
                    list_resp = gmail_list_messages(
                        access_token,
                        page_token=page_token,
                        query=list_q or "",
                        get_token=token_getter,
                    )
                    if on_list_page is not None:
                        try:
                            on_list_page(list_resp)
                        except Exception:
                            logger.debug("gmail_on_list_page_callback_failed", exc_info=True)
                    stubs: list[dict] = list(list_resp.get("messages") or [])
                    more_pages_for_log = bool(list_resp.get("nextPageToken"))
                    if not stubs and state.fetched == 0 and state.files_written == 0:
                        raise ValueError("No Gmail messages matched your query.")

                    logger.debug(
                        "gmail_list_page page=%s stubs=%s fetched=%s files=%s cap=%s next_page=%s",
                        list_pages_for_log,
                        len(stubs),
                        state.fetched,
                        state.files_written,
                        cap,
                        more_pages_for_log,
                    )

                    ids = [str(s.get("id", "") or "").strip() for s in stubs]
                    ids = [x for x in ids if x]
                    if not ids:
                        page_token = list_resp.get("nextPageToken")
                        if not page_token:
                            break
                        continue

                    offset = 0
                    while offset < len(ids) and not state.export_cap_reached():
                        if state.attachment_file_cap:
                            chunk = ids[offset : offset + batch_size]
                        else:
                            with state.lock:
                                remaining = state.cap - state.fetched
                            if remaining <= 0:
                                break
                            chunk = ids[offset : offset + batch_size]
                            if len(chunk) > remaining:
                                chunk = chunk[:remaining]
                        offset += len(chunk)
                        if not chunk:
                            break

                        logger.debug("gmail_fetch_batch size=%s started", len(chunk))
                        futures = [
                            pool.submit(
                                _gmail_export_one_message,
                                token_getter,
                                mid,
                                staging_root,
                                import_content,
                                state,
                            )
                            for mid in chunk
                        ]
                        for fut in futures:
                            paths = fut.result()
                            if export_stats is not None:
                                _publish_gmail_export_stats(state, export_stats, export_stats_lock)
                            for p in paths:
                                out_q.put(p)
                            if not paths and on_message_committed_no_paths is not None:
                                on_message_committed_no_paths()
                        logger.debug(
                            "gmail_fetch_batch size=%s done messages_fetched=%s files_written=%s",
                            len(chunk),
                            state.fetched,
                            state.files_written,
                        )

                    if state.export_cap_reached():
                        if state.staging_cap_hit and not state.attachment_file_cap and state.fetched < state.cap:
                            logger.warning(
                                "gmail_export_staging_cap messages_fetched=%s message_cap=%s bytes=%s max_bytes=%s",
                                state.fetched,
                                cap,
                                state.total_bytes,
                                GMAIL_EXPORT_MAX_STAGING_BYTES,
                            )
                        if state.staging_cap_hit and state.attachment_file_cap and state.files_written < state.cap:
                            logger.warning(
                                "gmail_export_staging_cap messages_fetched=%s files_written=%s file_cap=%s bytes=%s max_bytes=%s",
                                state.fetched,
                                state.files_written,
                                cap,
                                state.total_bytes,
                                GMAIL_EXPORT_MAX_STAGING_BYTES,
                            )
                        break
                    page_token = list_resp.get("nextPageToken")
                    if not page_token:
                        break
        except BaseException as exc:
            feeder_exc.append(exc)
        finally:
            out_q.put(_GMAIL_EXPORT_QUEUE_SENTINEL)

    thread = threading.Thread(target=feeder, name="gmail-export-feeder", daemon=True)
    thread.start()
    try:
        while True:
            item = out_q.get()
            if item is _GMAIL_EXPORT_QUEUE_SENTINEL:
                break
            yield item  # tuple(path, staged_part)
    finally:
        thread.join(timeout=7200)

    if feeder_exc:
        raise feeder_exc[0]

    if state.files_written == 0:
        staging_root.mkdir(parents=True, exist_ok=True)
        try:
            if staging_root.is_dir() and not any(staging_root.iterdir()):
                staging_root.rmdir()
        except OSError:
            pass
        if import_content == "attachments" and state.fetched > 0:
            logger.warning(
                "gmail_export_empty_attachments messages_fetched=%s message_cap=%s query=%r",
                state.fetched,
                cap,
                _truncate_gmail_query_for_log(list_q),
            )
            raise ValueError(
                f"No downloadable attachments in the first {state.fetched} message(s) from this search. "
                'Try "Body + attachments" or "Body text only", adjust Categories (e.g. other inbox tabs), '
                "or raise the attachment file limit, then run sort again."
            )
        logger.warning(
            "gmail_export_empty messages_fetched=%s message_cap=%s import_content=%s query=%r",
            state.fetched,
            cap,
            import_content,
            _truncate_gmail_query_for_log(list_q),
        )
        raise ValueError("No messages could be exported (empty result or size cap).")

    logger.info(
        "gmail_export_done import_content=%s messages_fetched=%s files_written=%s total_bytes=%s "
        "list_pages=%s more_pages_available=%s staging_dir=%s",
        import_content,
        state.fetched,
        state.files_written,
        state.total_bytes,
        list_pages_for_log,
        more_pages_for_log,
        staging_root.name,
    )


def export_gmail_messages_to_staging(
    access_token: str,
    *,
    query: str = GMAIL_QUERY_DEFAULT_INBOX,
    max_messages: int = 50,
    import_content: GmailImportContentMode = "both",
) -> tuple[list[str], pathlib.Path]:
    """
    List and fetch Gmail messages into a new staging directory.

    ``import_content`` controls whether each message contributes a body ``.txt``, downloaded
    attachment files, or both. Body files are named from the message **Subject** (sanitized for
    cross-platform paths; empty subject falls back to the Gmail message id). If that name is
    already in staging, it is suffixed with ``__{message_id}`` (then ``__n``). Attachments use
    Gmail's ``filename`` (with minimal path/Windows safety) and the same disambiguation rules.
    With ``attachments`` only, ``max_messages`` is the maximum number of **attachment files** saved;
    messages without usable attachments are skipped until that many files are written (or the
    mailbox list is exhausted). Raise the limit or widen the query if the export is empty.

    Returns:
        (absolute_file_paths, staging_root)

    Raises:
        ValueError: cap exceeded or no messages.
        httpx.HTTPStatusError: Gmail API errors.
    """
    staging_root = APP_STATE_DIR / "gmail_imports" / uuid.uuid4().hex
    staged = list(
        iter_gmail_export_file_paths(
            access_token,
            query=query,
            max_messages=max_messages,
            import_content=import_content,
            staging_root=staging_root,
        )
    )
    paths = [pair[0] for pair in staged]
    return paths, staging_root
