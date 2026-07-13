"""Tests for video filing extraction (mocked ffmpeg/vision/STT)."""

from __future__ import annotations

import os
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import video_extract  # noqa: E402
from video_extract import extract_video_for_filing  # noqa: E402


@pytest.fixture
def mp4_path(tmp_path: pathlib.Path) -> pathlib.Path:
    p = tmp_path / "clip.mp4"
    p.write_bytes(b"\x00\x00\x00\x20ftypisom")
    return p


def test_missing_ffmpeg_returns_low_signal(mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: None)
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "ffprobe")
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model=None)
    assert out["extraction_source"] == "video_low_signal"
    assert "LOW_SIGNAL_FALLBACK" in out["text"]
    assert out["signals"].get("video_error") == "ffmpeg_or_ffprobe_not_found"
    assert out["signals"].get("video_ffmpeg_ok") is False


def test_missing_ffmpeg_uses_sidecar_thumb_with_vision(
    mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sidecar = mp4_path.with_suffix(".video_thumb.jpg")
    sidecar.write_bytes(b"fake-jpg")
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: None)
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: None)
    monkeypatch.setattr(
        video_extract._vision,
        "describe_image_bytes",
        lambda _b, _model, purpose="filing": "Invoice shown on phone screen.",
    )
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model="llava")
    assert out["extraction_source"] == "video_visual_only"
    assert "invoice" in out["text"].lower()
    assert out["signals"].get("video_sidecar_thumb_used") is True


def test_combined_visual_and_stt(mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: "/bin/ffmpeg")
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "/bin/ffprobe")
    monkeypatch.setattr(video_extract, "probe_video_format", lambda path, ff: (100.0, {}))
    monkeypatch.setattr(video_extract, "extract_png_frame_to_bytes", lambda *a, **k: b"fakepng")

    def _audio_ok(*a, **k):
        return True

    monkeypatch.setattr(video_extract, "extract_audio_wav_16k_mono", _audio_ok)
    monkeypatch.setattr(video_extract, "VIDEO_STT_ENABLE", True)
    monkeypatch.setattr(video_extract, "_transcribe_wav", lambda path: ("meeting notes", True))

    def _desc(_b: bytes, _model: str, purpose: str = "filing") -> str:
        return "Whiteboard with a diagram."

    monkeypatch.setattr(video_extract._vision, "describe_image_bytes", _desc)
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model="llava")
    assert out["extraction_source"] == "video_combined"
    assert "[Visual]" in out["text"]
    assert "[Spoken]" in out["text"]
    assert "whiteboard" in out["text"].lower()
    assert "meeting notes" in out["text"]
    assert out["signals"].get("video_stt_used") is True
    assert out["signals"].get("video_frame_count") == int(video_extract.VIDEO_FRAME_COUNT)


def test_visual_only_stt_disabled(mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: "/bin/ffmpeg")
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "/bin/ffprobe")
    monkeypatch.setattr(video_extract, "probe_video_format", lambda path, ff: (50.0, {}))
    monkeypatch.setattr(video_extract, "extract_png_frame_to_bytes", lambda *a, **k: b"p")

    def _audio_ok(*a, **k):
        return True

    monkeypatch.setattr(video_extract, "extract_audio_wav_16k_mono", _audio_ok)
    monkeypatch.setattr(video_extract, "VIDEO_STT_ENABLE", False)

    def _desc(_b: bytes, _model: str, purpose: str = "filing") -> str:
        return "Outdoor scene with trees."

    monkeypatch.setattr(video_extract._vision, "describe_image_bytes", _desc)
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model="llava")
    assert out["extraction_source"] == "video_visual_only"
    assert "STT disabled" in out["text"]
    assert out["signals"].get("video_stt_used") is False


def test_transcript_only_without_vision(mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: "/bin/ffmpeg")
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "/bin/ffprobe")
    monkeypatch.setattr(video_extract, "probe_video_format", lambda path, ff: (30.0, {}))
    monkeypatch.setattr(video_extract, "extract_audio_wav_16k_mono", lambda *a, **k: True)
    monkeypatch.setattr(video_extract, "VIDEO_STT_ENABLE", True)
    monkeypatch.setattr(video_extract, "_transcribe_wav", lambda path: ("Only spoken content.", True))
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model=None)
    assert out["extraction_source"] == "video_transcript_only"
    assert "Only spoken content." in out["text"]
    assert out["signals"].get("video_frame_count") == 0


def test_container_metadata_merged_when_ffprobe_tags_present(
    mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: "/bin/ffmpeg")
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "/bin/ffprobe")
    monkeypatch.setattr(
        video_extract,
        "probe_video_format",
        lambda path, ff: (40.0, {"make": "Canon", "model": "Canon EOS 6D"}),
    )
    monkeypatch.setattr(video_extract, "extract_png_frame_to_bytes", lambda *a, **k: b"p")
    monkeypatch.setattr(video_extract, "extract_audio_wav_16k_mono", lambda *a, **k: False)
    monkeypatch.setattr(video_extract, "VIDEO_STT_ENABLE", False)
    monkeypatch.setattr(
        video_extract._vision, "describe_image_bytes", lambda _b, _m, purpose="filing": "Indoor scene."
    )
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model="llava")
    assert "Device (from file metadata)" in out["text"]
    assert "Canon" in out["text"]
    assert out["signals"].get("video_device_model") == "Canon EOS 6D"


def test_stt_unavailable_when_dependency_missing(mp4_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video_extract, "find_ffmpeg_binary", lambda: "/bin/ffmpeg")
    monkeypatch.setattr(video_extract, "find_ffprobe_binary", lambda: "/bin/ffprobe")
    monkeypatch.setattr(video_extract, "probe_video_format", lambda path, ff: (10.0, {}))
    monkeypatch.setattr(video_extract, "extract_png_frame_to_bytes", lambda *a, **k: None)
    monkeypatch.setattr(video_extract, "extract_audio_wav_16k_mono", lambda *a, **k: True)
    monkeypatch.setattr(video_extract, "VIDEO_STT_ENABLE", True)
    monkeypatch.setattr(video_extract, "_transcribe_wav", lambda path: ("", False))
    out = extract_video_for_filing(str(mp4_path), ["clip"], vision_model=None)
    assert "Speech-to-text unavailable" in out["text"]
    assert out["extraction_source"] == "video_low_signal"


def test_discover_vendored_ffmpeg_in_tree_finds_nested_bin(tmp_path: pathlib.Path) -> None:
    root = tmp_path / "tools" / "ffmpeg" / "ffmpeg-master-latest" / "bin"
    root.mkdir(parents=True)
    if os.name == "nt":
        ff_name, fp_name = "ffmpeg.exe", "ffprobe.exe"
    else:
        ff_name, fp_name = "ffmpeg", "ffprobe"
    (root / ff_name).write_bytes(b"x")
    (root / fp_name).write_bytes(b"x")
    bundle = tmp_path / "tools" / "ffmpeg"
    p1, p2 = video_extract.discover_vendored_ffmpeg_in_tree(bundle)
    assert p1 and p2
    assert p1.endswith(ff_name)
    assert p2.endswith(fp_name)


def test_discover_vendored_returns_none_when_bundle_missing(tmp_path: pathlib.Path) -> None:
    missing = tmp_path / "no-ffmpeg-here"
    assert video_extract.discover_vendored_ffmpeg_in_tree(missing) == (None, None)
