"""
Video ingestion for filing: ffprobe/ffmpeg decode, optional vision on still frames,
optional faster-whisper transcript. Returns the same payload shape as other extractors.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
from typing import Any

import vision as _vision
from constants import (
    MAX_CHARS,
    VIDEO_DEBUG_LOG,
    VIDEO_FFMPEG_TIMEOUT_SEC,
    VIDEO_FFPROBE_TIMEOUT_SEC,
    VIDEO_FRAME_COUNT,
    VIDEO_MAX_DURATION_SEC,
    VIDEO_MAX_EXTRACT_SEC,
    VIDEO_MAX_TRANSCRIPT_CHARS,
    VIDEO_METADATA_INCLUDE_AUTHOR,
    VIDEO_STT_COMPUTE_TYPE,
    VIDEO_STT_DEVICE,
    VIDEO_STT_ENABLE,
    VIDEO_STT_LANGUAGE,
    VIDEO_STT_MODEL,
)
from ingest_common import build_payload, estimate_quality, low_signal_hint

logger = logging.getLogger(__name__)

# faster-whisper loads weights from disk; reloading per video dominates wall time on multi-file jobs.
_whisper_lock = threading.Lock()
_whisper_model: Any = None
_whisper_model_key: str | None = None


def _whisper_config_key() -> str:
    return "|".join(
        [
            (VIDEO_STT_MODEL or "base").strip() or "base",
            (VIDEO_STT_DEVICE or "cpu").strip() or "cpu",
            (VIDEO_STT_COMPUTE_TYPE or "int8").strip() or "int8",
        ]
    )


def _get_cached_whisper_model() -> Any:
    """Return a process-wide WhisperModel for the current STT env settings (thread-safe)."""
    global _whisper_model, _whisper_model_key
    key = _whisper_config_key()
    with _whisper_lock:
        if _whisper_model is not None and _whisper_model_key == key:
            return _whisper_model
        from faster_whisper import WhisperModel

        model_name = (VIDEO_STT_MODEL or "base").strip() or "base"
        device = (VIDEO_STT_DEVICE or "cpu").strip() or "cpu"
        compute_type = (VIDEO_STT_COMPUTE_TYPE or "int8").strip() or "int8"
        _whisper_model = WhisperModel(model_name, device=device, compute_type=compute_type)
        _whisper_model_key = key
        return _whisper_model


def _log_video_debug(event: str, **fields: Any) -> None:
    if not VIDEO_DEBUG_LOG:
        return
    details = " ".join(f"{k}={fields[k]!r}" for k in sorted(fields))
    logger.info("video_debug event=%s %s", event, details)


def _read_sidecar_video_thumb_bytes(video_path: pathlib.Path) -> bytes | None:
    """Return bytes for ``<stem>.video_thumb.jpg`` when present."""
    sidecar = video_path.with_suffix(".video_thumb.jpg")
    if not sidecar.is_file():
        return None
    try:
        data = sidecar.read_bytes()
        return data if data else None
    except Exception:
        return None


def _env_ffmpeg_path() -> str:
    return str(os.environ.get("EXOSITES_FFMPEG_PATH", "") or "").strip()


def _env_ffprobe_path() -> str:
    return str(os.environ.get("EXOSITES_FFPROBE_PATH", "") or "").strip()


_vendored_default_pair_cache: tuple[str | None, str | None] | None = None


def discover_vendored_ffmpeg_in_tree(bundle_root: pathlib.Path) -> tuple[str | None, str | None]:
    """
    Locate a vendored ffmpeg/ffprobe pair under ``bundle_root`` (e.g. repo ``tools/ffmpeg/<build>/bin``).

    Windows expects ``ffmpeg.exe`` / ``ffprobe.exe``; POSIX expects bare names. Returns absolute paths.
    """
    if not bundle_root.is_dir():
        return None, None
    if os.name == "nt":
        ffmpeg_name, ffprobe_name = "ffmpeg.exe", "ffprobe.exe"
    else:
        ffmpeg_name, ffprobe_name = "ffmpeg", "ffprobe"
    for child in sorted(bundle_root.iterdir()):
        if not child.is_dir():
            continue
        bin_dir = child / "bin"
        if not bin_dir.is_dir():
            continue
        ff = bin_dir / ffmpeg_name
        fp = bin_dir / ffprobe_name
        if ff.is_file() and fp.is_file():
            return str(ff.resolve()), str(fp.resolve())
    return None, None


def _default_vendored_pair() -> tuple[str | None, str | None]:
    """First successful scan of ``<repo>/tools/ffmpeg`` (cached per process)."""
    global _vendored_default_pair_cache
    if _vendored_default_pair_cache is not None:
        return _vendored_default_pair_cache
    repo_root = pathlib.Path(__file__).resolve().parents[1]
    bundle = repo_root / "tools" / "ffmpeg"
    _vendored_default_pair_cache = discover_vendored_ffmpeg_in_tree(bundle)
    return _vendored_default_pair_cache


def find_ffmpeg_binary() -> str | None:
    p = _env_ffmpeg_path()
    if p and pathlib.Path(p).is_file():
        return p
    w = shutil.which("ffmpeg")
    if w:
        return w
    vff, _ = _default_vendored_pair()
    return vff


def find_ffprobe_binary() -> str | None:
    p = _env_ffprobe_path()
    if p and pathlib.Path(p).is_file():
        return p
    w = shutil.which("ffprobe")
    if w:
        return w
    _, vfp = _default_vendored_pair()
    return vfp


def get_video_ingest_runtime_summary() -> dict[str, Any]:
    """Resolved tooling + effective video constants (for ``/meta/video`` and support)."""
    ffmpeg = find_ffmpeg_binary()
    ffprobe = find_ffprobe_binary()
    vff, vfp = _default_vendored_pair()
    return {
        "ffmpeg_path": ffmpeg,
        "ffprobe_path": ffprobe,
        "can_decode_video": bool(ffmpeg and ffprobe),
        "vendored_bundle_detected": bool(vff and vfp),
        "frame_count": VIDEO_FRAME_COUNT,
        "max_duration_sec": VIDEO_MAX_DURATION_SEC,
        "max_extract_sec": VIDEO_MAX_EXTRACT_SEC,
        "max_transcript_chars": VIDEO_MAX_TRANSCRIPT_CHARS,
        "ffmpeg_timeout_sec": VIDEO_FFMPEG_TIMEOUT_SEC,
        "ffprobe_timeout_sec": VIDEO_FFPROBE_TIMEOUT_SEC,
        "stt_enabled": VIDEO_STT_ENABLE,
        "stt_model": (VIDEO_STT_MODEL or "base").strip() or "base",
        "debug_log": VIDEO_DEBUG_LOG,
    }


def run_subprocess(
    args: list[str],
    *,
    timeout_sec: float,
    cwd: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        cwd=cwd,
        check=False,
    )


def probe_video_format(path: str, ffprobe: str) -> tuple[float | None, dict[str, str]]:
    """
    One ffprobe call: duration plus normalized ``format``/first video stream tags
    (e.g. com.apple.quicktime.model → ``model``). Does not “understand” the scene; it
    surfaces what the file already encodes (camera, encoder) for the filing text.
    """
    args = [
        ffprobe,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
    ]
    try:
        cp = run_subprocess(args, timeout_sec=float(VIDEO_FFPROBE_TIMEOUT_SEC))
    except subprocess.TimeoutExpired:
        logger.debug("ffprobe timeout for %s", path)
        return None, {}
    if cp.returncode != 0:
        logger.debug("ffprobe failed rc=%s stderr=%s", cp.returncode, (cp.stderr or "")[:500])
        return None, {}
    try:
        data = json.loads(cp.stdout or "{}")
    except json.JSONDecodeError:
        return None, {}
    fmt = data.get("format") or {}
    dur_s = fmt.get("duration")
    duration: float | None
    try:
        duration = float(dur_s) if dur_s is not None and str(dur_s).strip() != "" else None
    except (TypeError, ValueError):
        duration = None
    out: dict[str, str] = {}
    for block in (fmt,):
        raw = block.get("tags")
        if isinstance(raw, dict):
            for k, v in raw.items():
                if not isinstance(v, str) or not v.strip():
                    continue
                key = str(k)
                if key.startswith("com.apple.quicktime."):
                    key = key.replace("com.apple.quicktime.", "", 1)
                out[key] = v.strip()[:300]
    for s in data.get("streams") or []:
        if s.get("codec_type") != "video":
            continue
        st = s.get("tags")
        if not isinstance(st, dict):
            break
        for k, v in st.items():
            if not isinstance(v, str) or not v.strip():
                continue
            key = str(k)
            if key == "timecode" and "timecode" in out:
                continue
            out[key] = v.strip()[:120]
        break
    return duration, out


def probe_duration(path: str, ffprobe: str) -> float | None:
    d, _tags = probe_video_format(path, ffprobe)
    return d


def _filing_lines_from_container_tags(tags: dict[str, str]) -> list[str]:
    """Plain-language device lines for the classifier; not a substitute for frame/STT content."""
    make = (tags.get("make") or "").strip()
    model = (tags.get("model") or "").strip()
    author = (tags.get("author") or "").strip()
    lines: list[str] = []
    if model:
        if make and make.lower() not in model.lower():
            lines.append(f"Device (from file metadata): {make} {model}")
        else:
            lines.append(f"Device (from file metadata): {model}")
    elif make:
        lines.append(f"Device (from file metadata): {make}")
    if VIDEO_METADATA_INCLUDE_AUTHOR and author:
        lines.append(f"Author (from file metadata): {author[:120]}")
    return lines[:3]


def _frame_timestamps(duration_sec: float | None) -> list[float]:
    n = max(1, int(VIDEO_FRAME_COUNT))
    if not duration_sec or duration_sec <= 0:
        defaults = [0.0, 5.0, 15.0]
        return defaults[:n]
    d = min(float(duration_sec), float(VIDEO_MAX_DURATION_SEC))
    if n == 1:
        return [min(max(d * 0.5, 0.0), max(0.0, d - 0.05))]
    raw = [d * 0.1, d * 0.5, d * 0.9]
    pts = sorted({min(max(0.0, t), max(0.0, d - 0.05)) for t in raw})
    while len(pts) < n and d > 0:
        pts.append(min(d * 0.5, max(0.0, d - 0.05)))
        pts = sorted(set(pts))
    return pts[:n]


def extract_png_frame_to_bytes(
    ffmpeg: str,
    video_path: str,
    timestamp_sec: float,
) -> bytes | None:
    args = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{timestamp_sec:.3f}",
        "-i",
        video_path,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-",
    ]
    try:
        cp = subprocess.run(
            args,
            capture_output=True,
            timeout=float(VIDEO_FFMPEG_TIMEOUT_SEC),
            check=False,
        )
    except subprocess.TimeoutExpired:
        logger.debug("ffmpeg frame extract timeout at t=%s", timestamp_sec)
        return None
    if cp.returncode != 0 or not cp.stdout:
        logger.debug(
            "ffmpeg frame failed t=%s rc=%s err=%s",
            timestamp_sec,
            cp.returncode,
            (cp.stderr or b"")[:300],
        )
        return None
    return cp.stdout


def extract_audio_wav_16k_mono(
    ffmpeg: str,
    video_path: str,
    *,
    start_sec: float,
    duration_sec: float,
    out_path: str,
) -> bool:
    args = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        video_path,
        "-t",
        f"{duration_sec:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        out_path,
    ]
    try:
        cp = run_subprocess(args, timeout_sec=float(VIDEO_FFMPEG_TIMEOUT_SEC))
    except subprocess.TimeoutExpired:
        return False
    if cp.returncode != 0:
        logger.debug("ffmpeg audio extract failed: %s", (cp.stderr or "")[:400])
        return False
    return pathlib.Path(out_path).is_file() and pathlib.Path(out_path).stat().st_size > 0


def _dedupe_visual_lines(lines: list[str]) -> list[str]:
    out: list[str] = []
    prev_norm: str | None = None
    for line in lines:
        s = (line or "").strip()
        if not s:
            continue
        norm = " ".join(s.lower().split())
        if norm == prev_norm:
            continue
        prev_norm = norm
        out.append(s)
    return out


def _transcribe_wav(path: str) -> tuple[str, bool]:
    """
    Returns (transcript, import_ok). If import_ok is False, STT dependency missing.
    """
    try:
        model = _get_cached_whisper_model()
    except ImportError:
        return "", False
    try:
        segments, _info = model.transcribe(
            path,
            language=VIDEO_STT_LANGUAGE,
        )
        parts: list[str] = []
        for seg in segments:
            t = (seg.text or "").strip()
            if t:
                parts.append(t)
        text = " ".join(parts).strip()
        if len(text) > VIDEO_MAX_TRANSCRIPT_CHARS:
            text = text[:VIDEO_MAX_TRANSCRIPT_CHARS].rsplit(" ", 1)[0] + "…"
        return text, True
    except Exception as exc:
        logger.debug("faster-whisper transcribe failed: %s", exc)
        return "", True


def extract_video_for_filing(
    file_path: str,
    filename_tokens: list[str],
    vision_model: str | None = None,
) -> dict[str, Any]:
    """
    Build an extraction payload for a video file using ffmpeg, optional vision frames,
    and optional local STT.
    """
    path = pathlib.Path(file_path)
    ffmpeg = find_ffmpeg_binary()
    ffprobe = find_ffprobe_binary()
    base_signals: dict[str, Any] = {
        "video_duration_sec": None,
        "video_frame_count": 0,
        "video_stt_used": False,
        "video_ffmpeg_ok": False,
        "video_error": None,
        "video_sidecar_thumb_used": False,
    }

    if not ffmpeg or not ffprobe:
        reason = "ffmpeg_or_ffprobe_not_found"
        base_signals["video_error"] = reason
        if vision_model:
            sidecar_bytes = _read_sidecar_video_thumb_bytes(path)
            if sidecar_bytes:
                try:
                    sidecar_desc = _vision.describe_image_bytes(
                        sidecar_bytes, vision_model, purpose="video_frame"
                    )
                except Exception as exc:
                    logger.debug("vision sidecar describe failed: %s", exc)
                    sidecar_desc = ""
                if sidecar_desc and str(sidecar_desc).strip():
                    base_signals["video_sidecar_thumb_used"] = True
                    meta_lines: list[str] = []
                    if ffprobe:
                        _dur, tagmap = probe_video_format(str(path), ffprobe)
                        if tagmap.get("make"):
                            base_signals["video_device_make"] = tagmap.get("make")
                        if tagmap.get("model"):
                            base_signals["video_device_model"] = tagmap.get("model")
                        meta_lines = _filing_lines_from_container_tags(tagmap)
                    meta_block = ("\n" + "\n".join(meta_lines)) if meta_lines else ""
                    txt = (
                        f"Video: {path.name}{meta_block}\n\n[Visual]\n{str(sidecar_desc).strip()}\n\n[Spoken]\n"
                        "Could not extract audio for transcription."
                    )[:MAX_CHARS]
                    _log_video_debug(
                        "extract_sidecar_fallback",
                        file=path.name,
                        ffmpeg_found=bool(ffmpeg),
                        ffprobe_found=bool(ffprobe),
                    )
                    return build_payload(
                        text=txt,
                        extraction_source="video_visual_only",
                        quality_score=min(0.72, max(0.2, estimate_quality(str(sidecar_desc)))),
                        file_path=file_path,
                        filename_tokens=filename_tokens,
                        ocr_used=False,
                        extra_signals=base_signals,
                    )
        _log_video_debug(
            "extract_failed_precheck",
            file=path.name,
            ffmpeg_found=bool(ffmpeg),
            ffprobe_found=bool(ffprobe),
            reason=reason,
        )
        return build_payload(
            text=low_signal_hint(file_path, kind="video"),
            extraction_source="video_low_signal",
            quality_score=0.05,
            file_path=file_path,
            filename_tokens=filename_tokens,
            ocr_used=False,
            extra_signals=base_signals,
        )

    duration, format_tags = probe_video_format(str(path), ffprobe)
    base_signals["video_duration_sec"] = duration
    if format_tags.get("make"):
        base_signals["video_device_make"] = format_tags["make"][:200]
    if format_tags.get("model"):
        base_signals["video_device_model"] = format_tags["model"][:200]
    base_signals["video_ffmpeg_ok"] = True
    _log_video_debug(
        "extract_started",
        file=path.name,
        duration_sec=duration,
        vision_model=vision_model or "",
        stt_enabled=VIDEO_STT_ENABLE,
    )

    visual_lines: list[str] = []
    transcript_real = ""
    stt_import_ok = True
    audio_ok = False
    wav_path: str | None = None
    tmpdir = tempfile.mkdtemp(prefix="exosites_video_")
    try:
        stamps = _frame_timestamps(duration)
        frames_extracted = 0
        if vision_model:
            for ts in stamps:
                png = extract_png_frame_to_bytes(ffmpeg, str(path), ts)
                if not png:
                    continue
                frames_extracted += 1
                try:
                    desc = _vision.describe_image_bytes(png, vision_model, purpose="video_frame")
                    if desc and str(desc).strip():
                        visual_lines.append(str(desc).strip())
                except Exception as exc:
                    logger.debug("vision frame describe failed: %s", exc)
            if not visual_lines:
                sidecar_bytes = _read_sidecar_video_thumb_bytes(path)
                if sidecar_bytes:
                    try:
                        sidecar_desc = _vision.describe_image_bytes(
                            sidecar_bytes, vision_model, purpose="video_frame"
                        )
                    except Exception as exc:
                        logger.debug("vision sidecar describe failed: %s", exc)
                        sidecar_desc = ""
                    if sidecar_desc and str(sidecar_desc).strip():
                        visual_lines.append(str(sidecar_desc).strip())
                        base_signals["video_sidecar_thumb_used"] = True
        base_signals["video_frame_count"] = frames_extracted

        cap_d = duration
        if cap_d is None:
            audio_len = float(VIDEO_MAX_EXTRACT_SEC)
        else:
            audio_len = min(float(cap_d), float(VIDEO_MAX_EXTRACT_SEC))
        if audio_len > 0:
            wav_path = os.path.join(tmpdir, "audio_16k.wav")
            audio_ok = extract_audio_wav_16k_mono(
                ffmpeg,
                str(path),
                start_sec=0.0,
                duration_sec=audio_len,
                out_path=wav_path,
            )
            if VIDEO_STT_ENABLE and audio_ok and wav_path:
                transcript_real, stt_import_ok = _transcribe_wav(wav_path)
                base_signals["video_stt_used"] = bool(stt_import_ok)

    finally:
        try:
            shutil.rmtree(tmpdir, ignore_errors=True)
        except Exception:
            pass

    visual_lines = _dedupe_visual_lines(visual_lines)
    has_visual = bool(visual_lines)
    has_spoken = bool(transcript_real.strip())

    if not VIDEO_STT_ENABLE:
        spoken_section = "STT disabled."
    elif not audio_ok:
        spoken_section = "Could not extract audio for transcription."
    elif not stt_import_ok:
        spoken_section = "Speech-to-text unavailable (install optional video requirements)."
    elif transcript_real.strip():
        spoken_section = transcript_real.strip()
    else:
        spoken_section = "(no speech detected)"

    header_parts = [f"Video: {path.name}"]
    if duration is not None:
        header_parts.append(f"Duration: {duration:.1f} s")
    header_parts.extend(_filing_lines_from_container_tags(format_tags))
    header = "\n".join(header_parts)
    body_parts = [header, "", "[Visual]"]
    if visual_lines:
        body_parts.append("\n".join(visual_lines))
    else:
        body_parts.append(
            "(no frame descriptions — set a vision model for richer video sorting)"
            if vision_model
            else "(no vision model — frame descriptions skipped)"
        )
    body_parts.extend(["", "[Spoken]", spoken_section])
    merged = "\n".join(body_parts).strip()[:MAX_CHARS]

    if has_visual and has_spoken:
        extraction_source = "video_combined"
    elif has_visual:
        extraction_source = "video_visual_only"
    elif has_spoken:
        extraction_source = "video_transcript_only"
    else:
        extraction_source = "video_low_signal"
        base_signals["video_error"] = base_signals.get("video_error") or "no_visual_or_transcript"
        if not base_signals.get("video_ffmpeg_ok"):
            merged = low_signal_hint(file_path, kind="video")

    q = estimate_quality(merged)
    if extraction_source == "video_combined":
        q = min(1.0, q + 0.14)
        if len(merged) > 450:
            q = min(1.0, q + 0.05)
    elif extraction_source == "video_transcript_only" and len(merged) > 320:
        q = min(1.0, q + 0.12)
    elif extraction_source == "video_visual_only" and len(merged) > 320:
        q = min(1.0, q + 0.10)
    if extraction_source == "video_low_signal":
        q = 0.05

    _log_video_debug(
        "extract_completed",
        file=path.name,
        extraction_source=extraction_source,
        quality_score=round(float(q), 4),
        has_visual=has_visual,
        has_spoken=has_spoken,
        frame_count=base_signals.get("video_frame_count", 0),
        stt_used=base_signals.get("video_stt_used", False),
        video_error=base_signals.get("video_error"),
        ffmpeg_ok=base_signals.get("video_ffmpeg_ok", False),
    )

    return build_payload(
        text=merged,
        extraction_source=extraction_source,
        quality_score=q,
        file_path=file_path,
        filename_tokens=filename_tokens,
        ocr_used=False,
        extra_signals=base_signals,
    )
