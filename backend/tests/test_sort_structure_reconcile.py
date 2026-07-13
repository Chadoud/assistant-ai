"""Tests for batch structure reconciliation."""

from unittest.mock import patch

from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate
from sort_structure.reconcile import (
    reconcile_structure_batch,
    should_skip_batch_reconcile,
)


def _contract():
    return compile_classify_contract(
        SortStructureTemplate(
            enabled=True,
            modules=[
                SortStructureModule(
                    id="c",
                    theme="country",
                    children=[
                        SortStructureModule(
                            id="p",
                            theme="property",
                            children=[SortStructureModule(id="a", theme="auto", children=[])],
                        )
                    ],
                )
            ],
        ),
        language="English",
    )


def _job_row(**kwargs):
    base = {
        "status": "review_ready",
        "structure_values": {"country": "Egypt", "property": "Plot 32"},
        "suggested_folder": "Egypt/Plot 32/Electricity",
        "final_folder": "Egypt/Plot 32/Electricity",
        "confidence": 0.55,
        "analysis_excerpt": "Canal company electricity Plot 32 Hurghada",
        "document_briefing": "Utility cost estimate for Plot 32",
        "primary_purpose": "electricity connection estimate",
        "decision_trace": {"v": 1},
    }
    base.update(kwargs)
    return base


def test_should_skip_when_disabled(monkeypatch) -> None:
    monkeypatch.setattr("sort_structure.reconcile.STRUCTURE_BATCH_RECONCILE_ENABLE", False)
    job = {"files": [_job_row(), _job_row(), _job_row()]}
    assert should_skip_batch_reconcile(job, _contract()) is True


def test_should_skip_tiny_job(monkeypatch) -> None:
    monkeypatch.setattr("sort_structure.reconcile.STRUCTURE_BATCH_RECONCILE_ENABLE", True)
    job = {"files": [_job_row(), _job_row()]}
    assert should_skip_batch_reconcile(job, _contract()) is True


def test_reconcile_disabled_no_op(monkeypatch) -> None:
    monkeypatch.setattr("sort_structure.reconcile.STRUCTURE_BATCH_RECONCILE_ENABLE", False)
    job = {"files": [_job_row(), _job_row(), _job_row()]}
    contract = _contract()
    before = job["files"][0]["suggested_folder"]
    assert reconcile_structure_batch(job, contract)["rewritten"] == 0
    assert job["files"][0]["suggested_folder"] == before


@patch("sort_structure.reconcile.chat")
def test_reconcile_applies_llm_rows(mock_chat, monkeypatch) -> None:
    monkeypatch.setattr("sort_structure.reconcile.STRUCTURE_BATCH_RECONCILE_ENABLE", True)
    mock_chat.return_value = {
        "message": {
            "content": (
                '{"rows": ['
                '{"index": 0, "country": "Egypt", "property": "Plot 32 — Hurghada", '
                '"subject": "Electricity", "confidence": 0.9, "outlier": false},'
                '{"index": 1, "country": "France", "property": "Passport", '
                '"subject": "Identity", "confidence": 0.85, "outlier": true}'
                "]}"
            )
        }
    }
    job = {
        "files": [
            _job_row(confidence=0.4),
            _job_row(
                structure_values={"country": "Uncertain", "property": ""},
                suggested_folder="Uncertain",
                final_folder="Uncertain",
                confidence=0.3,
                analysis_excerpt="REPUBLIQUE FRANCAISE passport ORNEX Nadine El Alami",
                document_briefing="French passport scan ORNEX France",
            ),
            _job_row(confidence=0.5),
        ]
    }
    contract = _contract()
    result = reconcile_structure_batch(job, contract)
    assert result["rewritten"] == 2
    assert result["ran"] is True
    assert job["files"][0]["decision_trace"]["structure_reconcile"] is True
    assert job["files"][0]["decision_trace"]["structure_cluster_source"] == "reconcile"
    assert "Plot 32" in str(job["files"][0]["suggested_folder"])
    assert job["files"][1]["structure_values"].get("country") == "France"


@patch("sort_structure.reconcile.chat")
def test_reconcile_merges_shared_cluster_id(mock_chat, monkeypatch) -> None:
    monkeypatch.setattr("sort_structure.reconcile.STRUCTURE_BATCH_RECONCILE_ENABLE", True)
    mock_chat.return_value = {
        "message": {
            "content": (
                '{"rows": ['
                '{"index": 0, "country": "Egypt", "property": "Building 32 — Hospital Street", '
                '"subject": "Electricity", "confidence": 0.9, "outlier": false},'
                '{"index": 1, "country": "Egypt", "property": "Building 32 — Hospital Street", '
                '"subject": "Payments", "confidence": 0.88, "outlier": false}'
                "]}"
            )
        }
    }
    job = {"files": [_job_row(confidence=0.4), _job_row(confidence=0.35), _job_row(confidence=0.5)]}
    result = reconcile_structure_batch(job, _contract())
    assert result["rewritten"] == 2
    cid0 = job["files"][0]["decision_trace"]["structure_cluster_id"]
    cid1 = job["files"][1]["decision_trace"]["structure_cluster_id"]
    assert cid0 == cid1
