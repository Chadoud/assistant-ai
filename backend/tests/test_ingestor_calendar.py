"""Tests for calendar (.ics/.vcs) deterministic extraction and sort short-circuit."""

from __future__ import annotations

import pathlib

from ingest_common import CALENDAR_EXTENSIONS
from sort_analyze_row import SortAnalyzeParams, run_sort_analyze_for_path

ICS_CONTENT = """\
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
SUMMARY:Team standup
DTSTART:20250115T090000Z
DTEND:20250115T093000Z
DESCRIPTION:Daily sync
END:VEVENT
END:VCALENDAR
"""


def test_calendar_extensions_set():
    assert ".ics" in CALENDAR_EXTENSIONS
    assert ".vcs" in CALENDAR_EXTENSIONS


def _make_params(tmp_path: pathlib.Path, filename: str, rules=None, existing_folders=None) -> SortAnalyzeParams:
    p = tmp_path / filename
    p.write_text(ICS_CONTENT, encoding="utf-8")

    classify_call_count = {"n": 0}

    def extract_content(path, *_a, **_k):
        from ingestor import extract_content as real_extract
        return real_extract(path, None, None, None, False)

    def classify_fn(*_a, **_k):
        classify_call_count["n"] += 1
        return {"folder_name": "ShouldNotBeUsed", "confidence": 0.9, "reason": "x"}

    params = SortAnalyzeParams(
        file_path=str(p),
        cfg={"model": "mistral", "language": "English", "rules": rules or []},
        existing_folders=existing_folders or [],
        existing_folders_lower={f.lower() for f in (existing_folders or [])},
        folder_contexts={},
        threshold=0.58,
        uncertain_folder="Uncertain",
        vision_vm=None,
        ocr_lang=None,
        ocr_langs=None,
        ocr_auto=False,
        structure_contract=None,
        extract_content=extract_content,
        classify_fn=classify_fn,
    )
    params._classify_call_count = classify_call_count
    return params


def test_ics_extraction_source(tmp_path: pathlib.Path):
    """extract_content tags .ics files with calendar_ics source."""
    from ingestor import extract_content
    p = tmp_path / "standup.ics"
    p.write_text(ICS_CONTENT, encoding="utf-8")
    payload = extract_content(str(p), None, None, None, False)
    assert payload["extraction_source"] == "calendar_ics"
    assert payload["quality_score"] == 1.0
    assert "BEGIN:VCALENDAR" in payload["text"]


def test_vcs_extraction_source(tmp_path: pathlib.Path):
    """extract_content tags .vcs files with calendar_ics source."""
    from ingestor import extract_content
    p = tmp_path / "event.vcs"
    p.write_text(ICS_CONTENT, encoding="utf-8")
    payload = extract_content(str(p), None, None, None, False)
    assert payload["extraction_source"] == "calendar_ics"


def test_ics_sort_skips_llm_uses_events_default(tmp_path: pathlib.Path):
    """Calendar file routes to Events without calling classify_fn."""
    params = _make_params(tmp_path, "standup.ics")
    result = run_sort_analyze_for_path(params)
    assert result.ok
    assert result.final_folder == "Events"
    assert result.confidence >= 0.95
    assert "Calendar" in result.reason or "calendar" in result.reason
    assert params._classify_call_count["n"] == 0


def test_ics_sort_prefers_existing_events_folder(tmp_path: pathlib.Path):
    """If an Events folder already exists, calendar routes there."""
    params = _make_params(tmp_path, "meeting.ics", existing_folders=["Invoices", "Events", "Photos"])
    result = run_sort_analyze_for_path(params)
    assert result.final_folder == "Events"


def test_ics_sort_picks_calendar_keyword_folder(tmp_path: pathlib.Path):
    """Matches a folder containing 'calendar' keyword."""
    params = _make_params(tmp_path, "dentist.ics", existing_folders=["Work Calendar", "Receipts"])
    result = run_sort_analyze_for_path(params)
    assert result.final_folder == "Work Calendar"


def test_ics_sort_no_matching_folder_creates_events(tmp_path: pathlib.Path):
    """No matching folder → new_folder_name is None (Events is a new folder)."""
    params = _make_params(tmp_path, "holiday.ics", existing_folders=["Invoices"])
    result = run_sort_analyze_for_path(params)
    assert result.final_folder == "Events"
