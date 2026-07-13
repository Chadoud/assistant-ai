"""Structure-aware analyze gates."""

from __future__ import annotations

import pathlib

from analyze_policy import STRUCTURE_UNCERTAIN_REASON, apply_analyze_gates


def test_structure_skips_ambiguous_rerank_gate() -> None:
    scored = {
        "folder_name": "Uncertain",
        "confidence": 0.95,
        "reason": "model uncertain",
        "llm_confidence": 0.95,
        "rerank_top_score": 0.24,
        "llm_folder_name": "Uncertain",
        "classification_disagree": False,
        "candidate_scores": [
            {"folder_name": "TrainingDocuments", "score": 0.24},
            {"folder_name": "Bud1", "score": 0.22},
        ],
        "candidate_margin": 0.02,
        "decision_trace": {
            "structure_template": True,
            "structure_rerank_skipped": True,
        },
    }
    result = apply_analyze_gates(
        scored=scored,
        file_path="/tmp/doc.jpg",
        quality_score=0.6,
        low_signal=False,
        existing_folders=["TrainingDocuments", "Bud1"],
        existing_folders_lower={"trainingdocuments", "bud1"},
        threshold=0.1,
        uncertain_folder="Uncertain",
        extracted_text="hurghada electricity utility",
    )
    assert "Ambiguous folder match" not in result.reason


def test_structure_uncertain_caps_confidence_and_reason() -> None:
    scored = {
        "folder_name": "Uncertain",
        "confidence": 0.95,
        "reason": "keywords related to Bud1",
        "llm_confidence": 0.95,
        "rerank_top_score": 0.95,
        "llm_folder_name": "Uncertain",
        "candidate_scores": [{"folder_name": "Uncertain", "score": 0.95}],
        "decision_trace": {"structure_template": True, "structure_rerank_skipped": True},
    }
    result = apply_analyze_gates(
        scored=scored,
        file_path="/tmp/doc.jpg",
        quality_score=0.6,
        low_signal=False,
        existing_folders=[],
        existing_folders_lower=set(),
        threshold=0.1,
        uncertain_folder="Uncertain",
        extracted_text="text",
    )
    assert result.confidence <= 0.5
    assert result.reason == STRUCTURE_UNCERTAIN_REASON


def test_structure_skips_new_folder_quality_block() -> None:
    scored = {
        "folder_name": "Egypt/Building 32 — Hospital Street/Electricity",
        "confidence": 0.8,
        "reason": "railway permit",
        "llm_confidence": 0.8,
        "rerank_top_score": 0.8,
        "llm_folder_name": "Egypt/Building 32 — Hospital Street/Electricity",
        "candidate_scores": [
            {"folder_name": "Egypt/Building 32 — Hospital Street/Electricity", "score": 0.8},
        ],
        "decision_trace": {
            "structure_template": True,
            "structure_rerank_skipped": True,
            "structure_assist": {"country": "geo", "auto_tail": "briefing"},
        },
        "structure_values": {"country": "Egypt", "property": "Building 32 — Hospital Street"},
    }
    result = apply_analyze_gates(
        scored=scored,
        file_path="/tmp/doc.jpg",
        quality_score=0.42,
        low_signal=False,
        existing_folders=[],
        existing_folders_lower=set(),
        threshold=0.1,
        uncertain_folder="Uncertain",
        extracted_text="hurghada railway permit electricity",
    )
    assert result.folder_name == "Egypt/Building 32 — Hospital Street/Electricity"
    assert "New folder blocked" not in result.reason


def test_structure_recovers_provisional_path_when_gates_uncertain() -> None:
    scored = {
        "folder_name": "Uncertain",
        "confidence": 0.2,
        "reason": "Low confidence; needs review",
        "llm_confidence": 0.2,
        "rerank_top_score": 0.2,
        "llm_folder_name": "Uncertain",
        "candidate_scores": [{"folder_name": "Uncertain", "score": 0.2}],
        "decision_trace": {
            "structure_template": True,
            "structure_rerank_skipped": True,
            "structure_assist": {"country": "geo", "property": "fingerprint", "auto_tail": "briefing"},
        },
        "structure_values": {"country": "Egypt", "property": "Building 32 — Hospital Street"},
        "structure_path_provisional": "Egypt/Building 32 — Hospital Street/Electricity",
    }
    result = apply_analyze_gates(
        scored=scored,
        file_path="/tmp/doc.jpg",
        quality_score=0.6,
        low_signal=False,
        existing_folders=[],
        existing_folders_lower=set(),
        threshold=0.9,
        uncertain_folder="Uncertain",
        extracted_text="hurghada electricity utility",
    )
    assert result.folder_name == "Egypt/Building 32 — Hospital Street/Electricity"
    assert result.reason != STRUCTURE_UNCERTAIN_REASON


def test_analyze_policy_structure_geo_repair_uae_to_egypt() -> None:
    text = (pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus" / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    scored = {
        "folder_name": "United Arab Emirates/Building 32 — Hospital Street/Electricity",
        "confidence": 0.1,
        "reason": "model pick",
        "llm_confidence": 0.85,
        "rerank_top_score": 0.85,
        "llm_folder_name": "United Arab Emirates/Building 32 — Hospital Street/Electricity",
        "candidate_scores": [
            {
                "folder_name": "United Arab Emirates/Building 32 — Hospital Street/Electricity",
                "score": 0.85,
            },
        ],
        "decision_trace": {
            "structure_template": True,
            "structure_rerank_skipped": True,
            "structure_assist": {
                "country": "geo_override",
                "property": "fingerprint",
                "auto_tail": "briefing",
            },
            "structure_auto_tail": "Electricity",
        },
        "structure_values": {
            "country": "Egypt",
            "property": "Building 32 — Hospital Street",
        },
        "structure_path_provisional": "Egypt/Building 32 — Hospital Street/Electricity",
    }
    result = apply_analyze_gates(
        scored=scored,
        file_path="/tmp/moj-form.jpg",
        quality_score=0.6,
        low_signal=False,
        existing_folders=[],
        existing_folders_lower=set(),
        threshold=0.1,
        uncertain_folder="Uncertain",
        extracted_text=text,
    )
    assert result.folder_name == "Egypt/Building 32 — Hospital Street/Electricity"
    assert result.confidence >= 0.7
    assert "conflicts with folder region" not in result.reason
