#!/usr/bin/env python3
"""
Compute baseline sorting KPIs from sort-plan CSV exports and optional NDJSON logs.

Usage (from backend/):
  python -m classify_eval.baseline_kpis --sort-plan "C:/path/sort-plan.csv"
  python -m classify_eval.baseline_kpis --sort-plan plan.csv --pipeline-ndjson "%APPDATA%/EXO/job_pipeline.ndjson"
"""

from __future__ import annotations

import argparse
import csv
import json
import pathlib
from collections import Counter, defaultdict
from statistics import median
from typing import Any


def _to_float(value: str | None) -> float | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    xs = sorted(values)
    if len(xs) == 1:
        return xs[0]
    idx = (len(xs) - 1) * max(0.0, min(1.0, p))
    lo = int(idx)
    hi = min(lo + 1, len(xs) - 1)
    frac = idx - lo
    return xs[lo] + (xs[hi] - xs[lo]) * frac


def _suffix(path_or_name: str) -> str:
    p = pathlib.Path(str(path_or_name or "").strip())
    return p.suffix.lower() or "(none)"


def _load_csv_rows(path: pathlib.Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _load_ndjson_rows(path: pathlib.Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                rows.append(parsed)
    return rows


def summarize_sort_plan(rows: list[dict[str, str]]) -> dict[str, Any]:
    n = len(rows)
    uncertain = 0
    error_rows = 0
    analyze_ms: list[float] = []
    by_extraction_uncertain: Counter[str] = Counter()
    by_suffix_errors: Counter[str] = Counter()
    by_extraction_rows: Counter[str] = Counter()
    by_extraction_errors: Counter[str] = Counter()
    confidence_by_extraction: dict[str, list[float]] = defaultdict(list)

    for r in rows:
        target = str(r.get("target_folder", "") or "").strip()
        status = str(r.get("status", "") or "").strip().lower()
        extraction_source = str(r.get("extraction_source", "") or "").strip() or "(missing)"
        by_extraction_rows[extraction_source] += 1

        if target.lower() == "uncertain":
            uncertain += 1
            by_extraction_uncertain[extraction_source] += 1

        if status == "error":
            error_rows += 1
            by_suffix_errors[_suffix(r.get("filename", "") or r.get("source_path", ""))] += 1
            by_extraction_errors[extraction_source] += 1

        dur = _to_float(r.get("analyze_duration_ms"))
        if dur is not None and dur >= 0:
            analyze_ms.append(dur)

        conf = _to_float(r.get("confidence"))
        if conf is not None:
            confidence_by_extraction[extraction_source].append(conf)

    extraction_table: list[dict[str, Any]] = []
    for src, count in by_extraction_rows.most_common():
        confs = confidence_by_extraction.get(src, [])
        extraction_table.append(
            {
                "source": src,
                "rows": count,
                "uncertain_rows": int(by_extraction_uncertain.get(src, 0)),
                "error_rows": int(by_extraction_errors.get(src, 0)),
                "uncertain_rate": (by_extraction_uncertain.get(src, 0) / count) if count else 0.0,
                "error_rate": (by_extraction_errors.get(src, 0) / count) if count else 0.0,
                "median_confidence": median(confs) if confs else None,
            }
        )

    return {
        "rows_total": n,
        "uncertain_rows": uncertain,
        "uncertain_rate": (uncertain / n) if n else 0.0,
        "error_rows": error_rows,
        "error_rate": (error_rows / n) if n else 0.0,
        "analyze_duration_ms": {
            "count": len(analyze_ms),
            "p50": _percentile(analyze_ms, 0.50),
            "p90": _percentile(analyze_ms, 0.90),
            "max": max(analyze_ms) if analyze_ms else None,
        },
        "top_error_suffixes": [
            {"suffix": s, "count": c} for s, c in by_suffix_errors.most_common(12)
        ],
        "by_extraction_source": extraction_table,
    }


def summarize_pipeline_ndjson(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {"rows_total": 0, "events": {}, "errors_by_phase": {}}

    events: Counter[str] = Counter()
    errors_by_phase: Counter[str] = Counter()
    for r in rows:
        event = str(r.get("event", "") or "").strip() or "(missing)"
        phase = str(r.get("phase", "") or "").strip() or "(missing)"
        events[event] += 1
        if "error" in event.lower():
            errors_by_phase[phase] += 1

    return {
        "rows_total": len(rows),
        "events": dict(events.most_common()),
        "errors_by_phase": dict(errors_by_phase.most_common()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute baseline KPIs for sorting runs.")
    parser.add_argument("--sort-plan", type=pathlib.Path, required=True, help="Path to sort-plan CSV export.")
    parser.add_argument(
        "--pipeline-ndjson",
        type=pathlib.Path,
        default=None,
        help="Optional job pipeline NDJSON for event/error mix.",
    )
    parser.add_argument(
        "--json-out",
        type=pathlib.Path,
        default=None,
        help="Optional output path for full JSON summary.",
    )
    args = parser.parse_args()

    if not args.sort_plan.is_file():
        raise SystemExit(f"sort-plan file not found: {args.sort_plan}")

    sort_rows = _load_csv_rows(args.sort_plan)
    out: dict[str, Any] = {
        "sort_plan_path": str(args.sort_plan),
        "sort_plan_kpis": summarize_sort_plan(sort_rows),
    }

    if args.pipeline_ndjson is not None and args.pipeline_ndjson.is_file():
        nd_rows = _load_ndjson_rows(args.pipeline_ndjson)
        out["pipeline_ndjson_path"] = str(args.pipeline_ndjson)
        out["pipeline_kpis"] = summarize_pipeline_ndjson(nd_rows)

    print(json.dumps(out, indent=2, ensure_ascii=False))
    if args.json_out:
        args.json_out.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
