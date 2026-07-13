"""Structure classify prompt + assist integration (mocked LLM)."""

from __future__ import annotations

import pathlib
import sys
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier import classify_scored  # noqa: E402
from constants import UNCERTAIN_FOLDER  # noqa: E402
from sort_structure.compile import ClassifyContract, ThemeLevel  # noqa: E402

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus"


def _country_auto_contract() -> ClassifyContract:
    return ClassifyContract(
        levels=(
            ThemeLevel(
                key="country",
                theme="country",
                prompt_instruction="Country",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="country",
                custom_label=None,
            ),
            ThemeLevel(
                key="auto_10",
                theme="auto",
                prompt_instruction="AI decides",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="auto",
                custom_label=None,
            ),
        ),
        has_auto_tail=True,
    )


@patch("classifier._ollama_chat_message_content")
def test_structure_prompt_omits_existing_folders(mock_chat) -> None:
    mock_chat.return_value = (
        '{"theme_values":{"country":"France"},"auto_tail":"Lease","confidence":0.9,'
        '"reason":"French lease","primary_purpose":"lease"}'
    )
    text = "Sample lease document"
    classify_scored(
        text,
        existing_folders=["Bud1", "TrainingDocuments", "BankStatements"],
        folder_contexts={
            "Bud1": {"keywords": ["bud"], "samples": ["binary junk"]},
        },
        model="mistral",
        language="English",
        structure_contract=_country_auto_contract(),
    )
    user_message = mock_chat.call_args[0][2]
    assert "Existing folders" not in user_message
    assert "Bud1" not in user_message
    assert "TrainingDocuments" not in user_message
    out = classify_scored(
        text,
        existing_folders=["Bud1"],
        folder_contexts={},
        model="mistral",
        language="English",
        structure_contract=_country_auto_contract(),
    )
    assert out["decision_trace"].get("structure_prompt_mode") == "themes_only"


@patch("classifier._ollama_chat_message_content")
def test_empty_llm_theme_values_filled_by_geo_assist(mock_chat) -> None:
    mock_chat.return_value = (
        '{"theme_values":{},"auto_tail":"","confidence":0.95,'
        '"reason":"Uncertain budget document","primary_purpose":"Finance"}'
    )
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    briefing = "Arabic utility connection form for electrical wiring in Hurghada."
    out = classify_scored(
        text,
        existing_folders=["Bud1", "TrainingDocuments"],
        folder_contexts={},
        model="mistral",
        language="English",
        document_briefing=briefing,
        structure_contract=_country_auto_contract(),
    )
    assert out["folder_name"].startswith("Egypt/")
    assert out["structure_values"].get("country") == "Egypt"
    assist = out["decision_trace"].get("structure_assist") or {}
    assert assist.get("country") == "geo"
    assert assist.get("auto_tail") == "briefing"
    assert "Bud1" not in str(out.get("reason", ""))
    assert out["folder_name"] != UNCERTAIN_FOLDER
    assert out["confidence"] <= 0.95
