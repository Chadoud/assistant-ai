"""Tests for GET /sort/status — resolved cloud/local sort models."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@patch("job_model_resolve.resolve_job_classify_model", return_value="mistral:latest")
@patch("routes.ollama_routes.resolve_vision_model", return_value="moondream:latest")
@patch("routes.ollama_routes.list_models", return_value=["mistral:latest", "moondream:latest", "nomic-embed-text"])
def test_sort_status_returns_resolved_models(_list, _vision, _classify):
    res = client.get("/sort/status")
    assert res.status_code == 200
    body = res.json()
    assert body["classify_model"] == "mistral:latest"
    assert body["vision_model"] == "moondream:latest"
    assert "mistral:latest" in body["installed_text_models"]
    assert "moondream:latest" in body["installed_vision_models"]
    assert "nomic-embed-text" in body["installed_embed_models"]
