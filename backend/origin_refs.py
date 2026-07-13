"""
Canonical origin references for memories and tasks — parse external_id, build open URLs.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

# Stable origin_kind values stored on memory_entries.
ORIGIN_MANUAL = "manual"
ORIGIN_CONVERSATION = "conversation"
ORIGIN_MEETING = "meeting"
ORIGIN_GMAIL_MESSAGE = "gmail_message"
ORIGIN_OUTLOOK_MESSAGE = "outlook_message"
ORIGIN_GOOGLE_CALENDAR_EVENT = "google_calendar_event"
ORIGIN_OUTLOOK_CALENDAR_EVENT = "outlook_calendar_event"
ORIGIN_TASK = "task"

_EXTERNAL_REF = re.compile(
    r"^(?P<source>gmail|outlook|google-calendar|outlook-calendar):(?P<kind>mail|cal):(?P<item_id>.+)$"
)

_PREPARE_FOR_PREFIX = "Prepare for: "


@dataclass(frozen=True)
class ParsedExternalRef:
    source: str
    kind: str  # mail | cal
    item_id: str

    @property
    def external_id(self) -> str:
        return f"{self.source}:{self.kind}:{self.item_id}"


@dataclass(frozen=True)
class OpenTarget:
    """Resolved open action for UI."""

    kind: str
    label: str
    url: str | None = None
    conversation_id: str | None = None
    meeting_id: str | None = None
    task_id: int | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"kind": self.kind, "label": self.label}
        if self.url:
            out["url"] = self.url
        if self.conversation_id:
            out["conversation_id"] = self.conversation_id
        if self.meeting_id:
            out["meeting_id"] = self.meeting_id
        if self.task_id is not None:
            out["task_id"] = self.task_id
        return out


def parse_external_id(external_id: str) -> ParsedExternalRef | None:
    """Parse ``gmail:mail:abc`` / ``google-calendar:cal:xyz`` style refs."""
    text = (external_id or "").strip()
    match = _EXTERNAL_REF.match(text)
    if not match:
        return None
    return ParsedExternalRef(
        source=match.group("source"),
        kind=match.group("kind"),
        item_id=match.group("item_id"),
    )


def origin_kind_from_external(parsed: ParsedExternalRef) -> str:
    if parsed.source == "gmail" and parsed.kind == "mail":
        return ORIGIN_GMAIL_MESSAGE
    if parsed.source == "outlook" and parsed.kind == "mail":
        return ORIGIN_OUTLOOK_MESSAGE
    if parsed.source == "google-calendar" and parsed.kind == "cal":
        return ORIGIN_GOOGLE_CALENDAR_EVENT
    if parsed.source == "outlook-calendar" and parsed.kind == "cal":
        return ORIGIN_OUTLOOK_CALENDAR_EVENT
    return ORIGIN_TASK


def provider_label_from_kind(origin_kind: str) -> str:
    return {
        ORIGIN_GMAIL_MESSAGE: "Gmail",
        ORIGIN_OUTLOOK_MESSAGE: "Outlook",
        ORIGIN_GOOGLE_CALENDAR_EVENT: "Google Calendar",
        ORIGIN_OUTLOOK_CALENDAR_EVENT: "Outlook Calendar",
        ORIGIN_CONVERSATION: "Chat",
        ORIGIN_MEETING: "Meeting",
        ORIGIN_MANUAL: "Manual",
        ORIGIN_TASK: "Task",
    }.get(origin_kind, "Source")


def _encode_google_calendar_eid(event_id: str, calendar_id: str = "primary") -> str:
    """Encode event + calendar into Google's calendar ``eid`` query param."""
    raw = f"{event_id} {calendar_id}".encode("utf-8")
    return base64.b64encode(raw).decode("ascii").replace("+", "-").replace("/", "_").rstrip("=")


def _extract_google_calendar_eid(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "google" not in host:
        return None
    if "calendar" not in host and "calendar" not in parsed.path:
        return None
    eid = (parse_qs(parsed.query).get("eid") or [None])[0]
    text = str(eid or "").strip()
    return text or None


def _decode_google_calendar_eid_payload(eid: str) -> str | None:
    padded = eid + "=" * (-len(eid) % 4)
    for decoder in (
        lambda value: base64.urlsafe_b64decode(value),
        lambda value: base64.b64decode(value.replace("-", "+").replace("_", "/")),
    ):
        try:
            return decoder(padded).decode("utf-8")
        except Exception:
            continue
    return None


def is_valid_google_calendar_open_url(
    url: str,
    *,
    expected_event_id: str | None = None,
) -> bool:
    """Return True when ``url`` contains a decodable Google Calendar event link."""
    eid = _extract_google_calendar_eid(url)
    if not eid:
        return False
    payload = _decode_google_calendar_eid_payload(eid)
    if not payload or " " not in payload:
        return False
    event_part, calendar_part = payload.rsplit(" ", 1)
    if not event_part.strip() or not calendar_part.strip():
        return False
    if re.search(r"(\d{8})T\d{8}T", event_part):
        return False
    if expected_event_id and event_part != expected_event_id:
        return False
    return True


def build_google_calendar_event_url(
    event_id: str,
    *,
    calendar_id: str = "primary",
) -> str:
    """Build a Google Calendar deep link from event and calendar ids."""
    eid = _encode_google_calendar_eid(event_id, calendar_id)
    return f"https://www.google.com/calendar/event?eid={eid}"


def build_url_from_external_ref(
    external_id: str,
    *,
    cached_url: str | None = None,
    calendar_id: str = "primary",
) -> str | None:
    """Build a provider URL from external_id; prefer validated cached_url when present."""
    parsed = parse_external_id(external_id)
    if (
        cached_url
        and cached_url.startswith(("https://", "http://"))
        and (
            not parsed
            or parsed.source != "google-calendar"
            or is_valid_google_calendar_open_url(
                cached_url,
                expected_event_id=parsed.item_id if parsed.kind == "cal" else None,
            )
        )
    ):
        return cached_url
    if not parsed:
        return None
    if parsed.source == "gmail" and parsed.kind == "mail":
        return f"https://mail.google.com/mail/u/0/#all/{quote(parsed.item_id, safe='')}"
    if parsed.source == "outlook" and parsed.kind == "mail":
        return f"https://outlook.office.com/mail/id/{quote(parsed.item_id, safe='')}"
    if parsed.source == "google-calendar" and parsed.kind == "cal":
        return build_google_calendar_event_url(parsed.item_id, calendar_id=calendar_id)
    if parsed.source == "outlook-calendar" and parsed.kind == "cal":
        return f"https://outlook.office.com/calendar/item/{quote(parsed.item_id, safe='')}"
    return None


def origin_from_task(task: dict[str, Any]) -> dict[str, str | int | None]:
    """Build origin envelope fields from a synced task row."""
    external_id = str(task.get("external_id") or "").strip()
    source_url = str(task.get("source_url") or "").strip() or None
    description = str(task.get("description") or "").strip()
    parsed = parse_external_id(external_id)
    if not parsed:
        return {}
    kind = origin_kind_from_external(parsed)
    label = description
    if label.startswith(_PREPARE_FOR_PREFIX):
        label = label[len(_PREPARE_FOR_PREFIX) :].strip()
    elif label.startswith("Commitment: "):
        label = label[len("Commitment: ") :].strip()
    url = build_url_from_external_ref(external_id, cached_url=source_url)
    return {
        "origin_kind": kind,
        "origin_ref": external_id,
        "origin_url": url,
        "origin_label": label[:120] if label else provider_label_from_kind(kind),
        "linked_task_id": int(task["id"]) if task.get("id") is not None else None,
    }


def origin_from_conversation(
    conversation_id: str, *, label: str | None = None
) -> dict[str, str | None]:
    return {
        "origin_kind": ORIGIN_CONVERSATION,
        "origin_ref": f"conv:{conversation_id}",
        "origin_url": None,
        "origin_label": label or "Chat",
    }


def origin_from_meeting(meeting_id: str, *, label: str | None = None) -> dict[str, str | None]:
    return {
        "origin_kind": ORIGIN_MEETING,
        "origin_ref": f"meeting:{meeting_id}",
        "origin_url": None,
        "origin_label": label or "Meeting",
    }


def origin_from_external_ref_string(
    origin_ref: str,
    *,
    label: str | None = None,
    cached_url: str | None = None,
) -> dict[str, str | None]:
    """Normalize a distillation/tool origin_ref into stored columns."""
    ref = (origin_ref or "").strip()
    if ref.startswith("conv:"):
        return origin_from_conversation(ref.removeprefix("conv:"), label=label)
    if ref.startswith("meeting:"):
        return origin_from_meeting(ref.removeprefix("meeting:"), label=label)
    parsed = parse_external_id(ref)
    if not parsed:
        return {}
    kind = origin_kind_from_external(parsed)
    return {
        "origin_kind": kind,
        "origin_ref": ref,
        "origin_url": build_url_from_external_ref(ref, cached_url=cached_url),
        "origin_label": (label or provider_label_from_kind(kind))[:120],
    }
