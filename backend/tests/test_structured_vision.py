"""Tests for structured vision extraction."""

from unittest.mock import patch

from sort_structure.vision_extract import StructuredVisionExtract


def test_structured_vision_extract_to_block() -> None:
    obj = StructuredVisionExtract(
        doc_kind="utility_cost_estimate",
        issuer_country="Egypt",
        property_cues=["Plot 32", "Hurghada"],
        subject_cues=["Electricity"],
        confidence=0.88,
    )
    block = obj.to_excerpt_block()
    assert block.startswith("[Structured]")
    assert "doc_kind: utility_cost_estimate" in block
    assert "issuer_country: Egypt" in block
    signals = obj.to_signals_dict()
    assert signals["doc_kind"] == "utility_cost_estimate"
    assert len(signals["property_cues"]) == 2


@patch("vision.chat")
def test_describe_image_structured_parses_json(mock_chat) -> None:
    mock_chat.return_value = {
        "message": {
            "content": (
                '{"doc_kind":"national_id_card","issuer_country":"Egypt",'
                '"property_cues":["Cairo"],"subject_cues":["Identity"],'
                '"confidence":0.9}'
            )
        }
    }
    from vision import describe_image_structured

    result = describe_image_structured(b"fakepng", "llava:7b")
    assert result is not None
    assert result.doc_kind == "national_id_card"
    assert result.issuer_country == "Egypt"


@patch("vision.chat")
def test_describe_image_structured_returns_none_on_bad_json(mock_chat) -> None:
    mock_chat.return_value = {"message": {"content": "not json"}}
    from vision import describe_image_structured

    assert describe_image_structured(b"x", "llava:7b") is None
