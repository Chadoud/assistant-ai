"""Tests for shared sort analyze row pipeline."""

from __future__ import annotations

import pathlib

from sort_analyze_row import SortAnalyzeParams, run_sort_analyze_for_path


def _make_base_params(
    tmp_path: pathlib.Path,
    filename: str,
    text: str,
    rules: list | None = None,
    classify_fn=None,
):
    p = tmp_path / filename
    p.write_text(text, encoding="utf-8")

    classify_calls = {"n": 0}

    def default_classify_fn(t, folders, contexts, model, language, fn_tokens, **kw):
        classify_calls["n"] += 1
        return {
            "folder_name": "Invoices",
            "confidence": 0.91,
            "reason": "invoice keywords",
            "decision_reason": "llm",
            "candidate_scores": [],
        }

    def extract_content(path, *_a, **_k):
        return {
            "text": pathlib.Path(path).read_text(encoding="utf-8"),
            "extraction_source": "plain_text",
            "quality_score": 0.9,
            "signals": {"filename_tokens": ["invoice", "acme"]},
        }

    params = SortAnalyzeParams(
        file_path=str(p),
        cfg={"model": "mistral", "language": "English", "rules": rules or []},
        existing_folders=["Invoices"],
        existing_folders_lower={"invoices"},
        folder_contexts={},
        threshold=0.58,
        uncertain_folder="Uncertain",
        vision_vm=None,
        ocr_lang=None,
        ocr_langs=None,
        ocr_auto=True,
        structure_contract=None,
        extract_content=extract_content,
        classify_fn=classify_fn or default_classify_fn,
    )
    params._classify_calls = classify_calls
    return params


def test_run_sort_analyze_for_path_happy_path(tmp_path: pathlib.Path) -> None:
    params = _make_base_params(tmp_path, "note.txt", "Invoice from Acme Corp dated January 2025")
    result = run_sort_analyze_for_path(params)
    assert result.ok is True
    assert result.suggested_folder == "Invoices"
    assert result.status == "review_ready"
    assert result.analyze_extract_ms is not None


def test_target_folder_rule_skips_llm(tmp_path: pathlib.Path) -> None:
    """A matching target_folder rule must route the file without calling classify_fn."""
    rule = {"id": "r1", "enabled": True, "priority": 0, "pattern": "*.txt", "action": "target_folder", "folder": "Archive"}
    params = _make_base_params(tmp_path, "note.txt", "Some content", rules=[rule])
    result = run_sort_analyze_for_path(params)
    assert result.ok is True
    assert result.final_folder == "Archive"
    assert result.rule_applied_id == "r1"
    assert result.confidence >= 0.95
    assert params._classify_calls["n"] == 0, "classify_fn must not be called for target_folder rules"


def test_skip_rule_still_calls_llm(tmp_path: pathlib.Path) -> None:
    """A skip rule should let LLM classify and propose a folder; only the action is skip."""
    rule = {"id": "r2", "enabled": True, "priority": 0, "pattern": "*.txt", "action": "skip", "folder": None}
    params = _make_base_params(tmp_path, "note.txt", "Invoice from Acme Corp dated January 2025", rules=[rule])
    result = run_sort_analyze_for_path(params)
    assert result.ok is True
    # LLM must have been called so a suggested_folder is available for manual review.
    assert params._classify_calls["n"] >= 1, "classify_fn must be called when rule action is skip"


def test_briefing_skipped_for_docx_text(tmp_path: pathlib.Path) -> None:
    """docx_text extraction source with good quality skips the briefing LLM call."""
    from job_service.analyze_support import should_skip_briefing_for_small_plaintext

    result = should_skip_briefing_for_small_plaintext(
        text="Service agreement between Alpha Corp and Beta Ltd dated 2025-03-01 " * 20,
        extraction_source="docx_text",
        quality_score=0.88,
        low_signal=False,
        gmail_staged_part=None,
    )
    assert result is True


def test_briefing_skipped_for_spreadsheet_preview(tmp_path: pathlib.Path) -> None:
    """spreadsheet_preview extraction source with good quality skips the briefing LLM call."""
    from job_service.analyze_support import should_skip_briefing_for_small_plaintext

    result = should_skip_briefing_for_small_plaintext(
        text="Date | Amount | Description\n2025-01 | 1200 | Rent\n2025-02 | 1200 | Rent\n" * 10,
        extraction_source="spreadsheet_preview",
        quality_score=0.75,
        low_signal=False,
        gmail_staged_part=None,
    )
    assert result is True


def test_briefing_not_skipped_for_low_quality_docx(tmp_path: pathlib.Path) -> None:
    """docx_text with quality below the threshold still runs briefing."""
    from job_service.analyze_support import should_skip_briefing_for_small_plaintext

    result = should_skip_briefing_for_small_plaintext(
        text="abc",
        extraction_source="docx_text",
        quality_score=0.10,
        low_signal=False,
        gmail_staged_part=None,
    )
    assert result is False
