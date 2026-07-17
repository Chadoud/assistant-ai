"""Tests for composer attachment document extract."""

from __future__ import annotations

from pathlib import Path

import pytest

from composer_attachment_extract import extract_attachment_for_chat


def test_extract_rejects_video(tmp_path, monkeypatch):
    monkeypatch.setattr("composer_attachment_extract._home", lambda: tmp_path)
    video = tmp_path / "clip.mp4"
    video.write_bytes(b"\x00\x00\x00\x18ftypmp42")
    out = extract_attachment_for_chat(str(video))
    assert out["ok"] is False
    assert out["error"] == "video_not_supported"


def test_extract_txt(tmp_path, monkeypatch):
    monkeypatch.setattr("composer_attachment_extract._home", lambda: tmp_path)
    note = tmp_path / "note.txt"
    note.write_text("Hello from composer attach.\n" * 20, encoding="utf-8")
    out = extract_attachment_for_chat(str(note))
    assert out["ok"] is True
    assert "Hello from composer attach" in out["text"]
    assert out["basename"] == "note.txt"


def test_extract_pdf_text(tmp_path, monkeypatch):
    fitz = pytest.importorskip("fitz")
    monkeypatch.setattr("composer_attachment_extract._home", lambda: tmp_path)
    pdf_path = tmp_path / "cv.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Chady Kassab CV experience skills")
    doc.save(pdf_path)
    doc.close()

    # Isolate from ingestor OCR/signal heuristics (CI may classify insert_text PDFs as scanned).
    monkeypatch.setattr(
        "ingestor.extract_content",
        lambda _path, vision_model=None: {
            "text": "Chady Kassab CV experience skills",
            "extraction_source": "pdf_text",
            "page_count": 1,
        },
    )

    out = extract_attachment_for_chat(str(pdf_path))
    assert out["ok"] is True
    assert "Chady" in out["text"] or "Kassab" in out["text"]
    assert out["kind"] == "document"
    assert out.get("previewDataUrl", "").startswith("data:image/jpeg;base64,")


def test_extract_blocks_outside_home(tmp_path, monkeypatch):
    monkeypatch.setattr("composer_attachment_extract._home", lambda: tmp_path)
    outside = Path("/etc/hosts")
    if not outside.is_file():
        pytest.skip("no /etc/hosts")
    out = extract_attachment_for_chat(str(outside))
    assert out["ok"] is False
    assert out["error"] == "path_not_allowed"
