#!/usr/bin/env python3
"""
End-to-end eval: extract_content(path) -> classify_candidates -> same policy gates as JobService.

Uses optional vision model name (default: none / auto from Ollama list in-process).

Usage (from backend/, Ollama running for classify step):
  python -m classify_eval.run_file_eval --paths file1.pdf file2.txt
  python -m classify_eval.run_file_eval --list paths.txt
  python -m classify_eval.run_file_eval --dir "C:/data/docs" --max-files 30

Set OLLAMA_EVAL=0 to skip classification (prints extraction only).
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from analyze_policy import apply_analyze_gates  # noqa: E402
from classifier import classify_candidates  # noqa: E402
from constants import (  # noqa: E402
    CONFIDENCE_THRESHOLD,
    DOCUMENT_BRIEFING_ENABLE,
    UNCERTAIN_FOLDER,
)
from document_briefing import brief_document_for_filing  # noqa: E402
from ingestor import extract_content  # noqa: E402
from language_detect import detect_document_language  # noqa: E402


def _iter_paths(args: argparse.Namespace) -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    if args.paths:
        out.extend(pathlib.Path(p) for p in args.paths)
    if args.list:
        raw = pathlib.Path(args.list).read_text(encoding="utf-8")
        for line in raw.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(pathlib.Path(line))
    if args.dir:
        root = pathlib.Path(args.dir)
        if root.is_dir():
            for p in sorted(root.rglob("*")):
                if p.is_file():
                    out.append(p)
                    if len(out) >= args.max_files:
                        break
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract + classify + gate simulation for real files.")
    parser.add_argument("--paths", nargs="*", help="File paths")
    parser.add_argument("--list", type=str, default=None, help="Text file with one path per line")
    parser.add_argument("--dir", type=str, default=None, help="Scan directory (non-recursive depth via rglob *)")
    parser.add_argument("--max-files", type=int, default=50)
    parser.add_argument("--model", default=os.environ.get("MODEL", "mistral"))
    parser.add_argument("--language", default=os.environ.get("EVAL_LANGUAGE", "English"))
    parser.add_argument(
        "--existing-folders",
        default="",
        help="Comma-separated folder names (simulates output tree).",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=None,
        help="Override job min_confidence (default: server CONFIDENCE_THRESHOLD).",
    )
    args = parser.parse_args()

    paths = _iter_paths(args)
    if not paths:
        print("No paths: use --paths, --list, or --dir", file=sys.stderr)
        return 1

    existing = [x.strip() for x in args.existing_folders.split(",") if x.strip()]
    existing_lower = {e.lower() for e in existing}
    thr = float(args.min_confidence) if args.min_confidence is not None else CONFIDENCE_THRESHOLD

    skip_llm = os.environ.get("OLLAMA_EVAL", "").lower() in ("0", "false", "no")
    vision_vm = None
    try:
        from classifier import list_models
        from vision import resolve_vision_model

        vision_vm = resolve_vision_model(list_models(), None)
    except Exception:
        pass

    for p in paths:
        if not p.is_file():
            print(f"[skip] not a file: {p}")
            continue
        try:
            payload = extract_content(str(p), vision_vm)
        except Exception as exc:
            print(f"[{p.name}] extract ERROR: {exc}")
            continue

        text = str(payload.get("text", "") or "")
        q = float(payload.get("quality_score", 0.0))
        src = str(payload.get("extraction_source", ""))
        low_signal = text.startswith("LOW_SIGNAL_FALLBACK")
        tokens = []
        doc_hint = None
        sig = payload.get("signals") or {}
        if isinstance(sig, dict):
            if isinstance(sig.get("filename_tokens"), list):
                tokens = [str(t) for t in sig["filename_tokens"]]
            if isinstance(sig.get("document_hint"), str) and sig["document_hint"].strip():
                doc_hint = sig["document_hint"].strip()

        print(f"\n=== {p.name} ===")
        print(f"  extraction_source={src}  quality_score={q:.3f}  low_signal={low_signal}")
        if skip_llm:
            print("  OLLAMA_EVAL=0 — skipping classify.")
            continue

        try:
            detected = detect_document_language(text, fallback=args.language)
            briefing = None
            if DOCUMENT_BRIEFING_ENABLE:
                briefing = brief_document_for_filing(
                    text,
                    model=args.model,
                    document_hint=doc_hint,
                    source_filename=p.name,
                    classification_language=detected,
                )
            scored = classify_candidates(
                text,
                existing,
                {},
                model=args.model,
                language=args.language,
                filename_tokens=tokens,
                extraction_quality=q,
                source_filename=p.name,
                document_hint=doc_hint,
                document_briefing=briefing,
            )
        except Exception as exc:
            print(f"  classify ERROR: {exc}")
            continue

        gate = apply_analyze_gates(
            scored=scored,
            file_path=str(p),
            quality_score=q,
            low_signal=low_signal,
            existing_folders=existing,
            existing_folders_lower=existing_lower,
            threshold=thr,
            uncertain_folder=UNCERTAIN_FOLDER,
            extracted_text=text,
        )
        folder, conf, reason = gate.folder_name, gate.confidence, gate.reason
        print(f"  raw_model_folder={scored.get('folder_name')!r} conf={float(scored.get('confidence', 0)):.3f}")
        print(f"  after_gates -> {folder!r}  conf={conf:.3f}  reason={reason}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
