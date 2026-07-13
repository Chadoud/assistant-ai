#!/usr/bin/env python3
"""
Batch classification eval: loads JSON fixtures and runs classify_candidates.

Requires a running Ollama instance and the model you pass (default from env MODEL or mistral).

Usage (from backend/):
  python -m classify_eval.run_eval
  python -m classify_eval.run_eval --model qwen2.5:32b --json-out eval-report.json
  set OLLAMA_EVAL=0   # skip live calls (exit 0)

Fixture optional fields:
  extraction_quality, document_hint, source_filename,
  gates: { "file_path": "stub.pdf" }, gold_after_gates (expected folder after apply_analyze_gates).
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from analyze_policy import apply_analyze_gates  # noqa: E402
from classifier import classify_candidates  # noqa: E402
from classify_eval.eval_metrics import compute_eval_metrics  # noqa: E402
from constants import CONFIDENCE_THRESHOLD, UNCERTAIN_FOLDER  # noqa: E402


def _fixtures_dir() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent / "fixtures"


def load_fixtures() -> list[dict]:
    out: list[dict] = []
    d = _fixtures_dir()
    if not d.is_dir():
        return out
    for p in sorted(d.glob("*.json")):
        if p.name.startswith("gold_labels"):
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"skip {p}: {exc}", file=sys.stderr)
            continue
        if not isinstance(raw, dict):
            print(f"skip {p}: expected object fixture", file=sys.stderr)
            continue
        out.append(raw)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Run classification eval fixtures against Ollama.")
    parser.add_argument("--model", default=os.environ.get("MODEL", "mistral"), help="Ollama model name")
    parser.add_argument(
        "--language",
        default=os.environ.get("EVAL_LANGUAGE", "English"),
        help="Folder naming language",
    )
    parser.add_argument(
        "--json-out",
        default=None,
        help="Write structured results JSON to this path.",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=None,
        help="Threshold for optional gold_after_gates checks (default CONFIDENCE_THRESHOLD).",
    )
    args = parser.parse_args()

    if os.environ.get("OLLAMA_EVAL", "").lower() in ("0", "false", "no"):
        print("OLLAMA_EVAL=0 — skipping live eval.")
        return 0

    cases = load_fixtures()
    if not cases:
        print("No fixtures in", _fixtures_dir())
        return 1

    thr = float(args.min_confidence) if args.min_confidence is not None else float(CONFIDENCE_THRESHOLD)
    print(f"Model={args.model!r}  fixtures={len(cases)}\n")

    correct = 0
    labeled = 0
    gates_labeled = 0
    gates_correct = 0
    report_rows: list[dict] = []

    for c in cases:
        cid = c.get("id", "?")
        text = str(c.get("text", ""))
        existing = list(c.get("existing_folders") or [])
        ctx = c.get("folder_contexts") or {}
        tokens = list(c.get("filename_tokens") or [])
        gold = c.get("gold_folder")
        ext_q = c.get("extraction_quality")
        extraction_quality = float(ext_q) if ext_q is not None else None
        doc_hint = c.get("document_hint")
        document_hint = str(doc_hint).strip() if isinstance(doc_hint, str) and doc_hint.strip() else None
        src_fn = c.get("source_filename")
        source_filename = str(src_fn) if isinstance(src_fn, str) and src_fn.strip() else None
        br = c.get("document_briefing")
        document_briefing = str(br).strip() if isinstance(br, str) and br.strip() else None
        cl = c.get("classification_language")
        classification_language = str(cl).strip() if isinstance(cl, str) and cl.strip() else None

        try:
            result = classify_candidates(
                text,
                existing,
                ctx,
                model=args.model,
                language=args.language,
                filename_tokens=tokens,
                extraction_quality=extraction_quality,
                source_filename=source_filename,
                document_hint=document_hint,
                document_briefing=document_briefing,
                classification_language=classification_language,
            )
        except Exception as exc:
            print(f"[{cid}] ERROR: {exc}")
            report_rows.append({"id": cid, "error": str(exc)})
            continue

        pred = result.get("folder_name", "")
        scores = result.get("candidate_scores") or []
        ranked = sorted(scores, key=lambda x: float(x.get("score", 0)), reverse=True)
        margin = 0.0
        if len(ranked) >= 2:
            margin = float(ranked[0].get("score", 0)) - float(ranked[1].get("score", 0))

        disagree = bool(result.get("classification_disagree"))
        primary = result.get("primary_purpose")

        match_note = ""
        if gold is not None:
            labeled += 1
            ok = str(pred).strip().lower() == str(gold).strip().lower()
            if ok:
                correct += 1
                match_note = "  OK"
            else:
                match_note = f"  (gold={gold!r})"

        print(
            f"[{cid}] -> {pred!r}  margin={margin:.3f}  disagree={disagree}  "
            f"primary_purpose={primary!r}{match_note}"
        )
        print(f"    decision: {result.get('decision_reason', '')[:160]}")

        row: dict = {
            "id": cid,
            "pred": pred,
            "gold": gold,
            "margin": margin,
            "candidate_margin": result.get("candidate_margin"),
            "classification_disagree": disagree,
            "primary_purpose": primary,
            "decision_reason": result.get("decision_reason"),
        }

        gold_gates = c.get("gold_after_gates")
        gates_in = c.get("gates")
        if gold_gates is not None and isinstance(gates_in, dict):
            existing_lower = {e.strip().lower() for e in existing}
            fp = str(gates_in.get("file_path") or "eval_fixture.pdf")
            qg = gates_in.get("quality_score")
            q_gate = float(qg) if qg is not None else float(extraction_quality or 0.5)
            low = bool(gates_in.get("low_signal", False))
            gate = apply_analyze_gates(
                scored=result,
                file_path=fp,
                quality_score=q_gate,
                low_signal=low,
                existing_folders=existing,
                existing_folders_lower=existing_lower,
                threshold=thr,
                uncertain_folder=UNCERTAIN_FOLDER,
                extracted_text=text,
            )
            gated_folder = gate.folder_name
            gates_labeled += 1
            g_ok = str(gated_folder).strip().lower() == str(gold_gates).strip().lower()
            if g_ok:
                gates_correct += 1
            print(f"    after_gates -> {gated_folder!r} (gold_after_gates={gold_gates!r}){' OK' if g_ok else ''}")
            row["after_gates"] = gated_folder
            row["gold_after_gates"] = gold_gates
            row["gates_ok"] = g_ok

        report_rows.append(row)

    summary = {
        "model": args.model,
        "language": args.language,
        "labeled_accuracy": f"{correct}/{labeled}" if labeled else None,
        "gates_accuracy": f"{gates_correct}/{gates_labeled}" if gates_labeled else None,
        "rows": report_rows,
        "metrics": compute_eval_metrics(report_rows),
    }

    if labeled:
        print(f"\nLabeled accuracy (raw classify): {correct}/{labeled}")
    if gates_labeled:
        print(f"Gated accuracy (apply_analyze_gates): {gates_correct}/{gates_labeled}")
    mets = summary.get("metrics") or {}
    if mets.get("margin_stats"):
        print("\nMargin stats (top1 vs top2 rerank score gap):", mets["margin_stats"])
    if mets.get("confusion_pairs"):
        print("\nTop confusion (pred -> gold):")
        for row in mets["confusion_pairs"][:10]:
            print(f"  {row['count']:3d}  {row['pred']!r} -> {row['gold']!r}")

    if args.json_out:
        pathlib.Path(args.json_out).write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nWrote {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
