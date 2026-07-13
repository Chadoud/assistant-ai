"""Cloud sort-worker HTTP client."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from sort_analyze_row import SortAnalyzeParams


def test_cloud_sort_analyze_file_url(monkeypatch: pytest.MonkeyPatch) -> None:
    from cloud_sort.config import cloud_sort_analyze_file_url

    monkeypatch.setenv("EXOSITES_CLOUD_SORT_WORKER_URL", "https://llm.example/v1/sort/worker")
    assert cloud_sort_analyze_file_url() == "https://llm.example/v1/sort/worker/analyze-file"


def test_remote_sort_analyze_posts_to_analyze_file(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    from cloud_sort.client import remote_sort_analyze_file

    sample = tmp_path / "doc.pdf"
    sample.write_bytes(b"%PDF-1.4")

    monkeypatch.setenv(
        "EXOSITES_CLOUD_SORT_WORKER_URL",
        "https://llm-staging.exosites.ch/v1/sort/worker",
    )
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "ok": True,
        "result": {
            "status": "review_ready",
            "final_folder": "Invoices",
            "confidence": 0.9,
            "approved": True,
        },
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.post.return_value = response

    params = SortAnalyzeParams(
        file_path=str(sample),
        cfg={"language": "English"},
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
        extract_content=lambda *_a, **_k: {},
        classify_fn=lambda *_a, **_k: {},
    )

    with patch("cloud_sort.client.httpx.Client", return_value=client):
        result = remote_sort_analyze_file(params)

    assert result.ok is True
    assert result.final_folder == "Invoices"
    post_args = client.post.call_args
    assert post_args.args[0] == "https://llm-staging.exosites.ch/v1/sort/worker/analyze-file"
    assert post_args.kwargs["headers"]["Authorization"] == "Bearer sk-test"
    assert "payload" in post_args.kwargs["data"]


def test_result_from_worker_json_rejects_nested_error() -> None:
    from cloud_sort.client import _result_from_worker_json

    out = _result_from_worker_json(
        {
            "ok": True,
            "result": {
                "status": "error",
                "error": "extract failed",
            },
        }
    )
    assert out.ok is False
    assert out.status == "error"
    assert "extract failed" in str(out.error)


def test_result_from_worker_json_rejects_top_level_failure() -> None:
    from cloud_sort.client import _result_from_worker_json

    out = _result_from_worker_json({"ok": False, "error": "worker busy"})
    assert out.ok is False
    assert out.error == "worker busy"


def test_serialize_structure_contract_dataclass() -> None:
    from cloud_sort.client import _serialize_structure_contract
    from sort_structure.compile import compile_classify_contract
    from sort_structure.models import SortStructureModule, SortStructureTemplate

    tpl = SortStructureTemplate(
        enabled=True,
        modules=[SortStructureModule(id="c", theme="country", children=[])],
    )
    contract = compile_classify_contract(tpl)
    wire = _serialize_structure_contract(contract)
    assert isinstance(wire, dict)
    assert wire["levels"][0]["theme"] == "country"
