from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classify_eval.baseline_kpis import summarize_pipeline_ndjson, summarize_sort_plan


def test_summarize_sort_plan_core_kpis() -> None:
    rows = [
        {
            "target_folder": "Uncertain",
            "status": "review_ready",
            "extraction_source": "pdf_text",
            "filename": "a.pdf",
            "analyze_duration_ms": "100",
            "confidence": "0.2",
        },
        {
            "target_folder": "Finance/Invoices",
            "status": "error",
            "extraction_source": "spreadsheet_preview",
            "filename": "sheet.xlsx",
            "analyze_duration_ms": "300",
            "confidence": "",
        },
        {
            "target_folder": "Marketing/Branding",
            "status": "review_ready",
            "extraction_source": "pdf_text",
            "filename": "b.pdf",
            "analyze_duration_ms": "200",
            "confidence": "0.95",
        },
    ]
    out = summarize_sort_plan(rows)
    assert out["rows_total"] == 3
    assert out["uncertain_rows"] == 1
    assert out["error_rows"] == 1
    assert out["analyze_duration_ms"]["p50"] == 200.0
    assert out["analyze_duration_ms"]["p90"] is not None
    assert out["top_error_suffixes"][0]["suffix"] == ".xlsx"
    src = {x["source"]: x for x in out["by_extraction_source"]}
    assert src["pdf_text"]["rows"] == 2
    assert src["pdf_text"]["uncertain_rows"] == 1
    assert src["spreadsheet_preview"]["error_rows"] == 1


def test_summarize_pipeline_ndjson_events() -> None:
    rows = [
        {"event": "analyze_file_error", "phase": "analyzing"},
        {"event": "analyze_file_error", "phase": "analyzing"},
        {"event": "apply_file_error", "phase": "applying"},
        {"event": "classify_ok", "phase": "analyzing"},
    ]
    out = summarize_pipeline_ndjson(rows)
    assert out["rows_total"] == 4
    assert out["events"]["analyze_file_error"] == 2
    assert out["errors_by_phase"]["analyzing"] == 2
