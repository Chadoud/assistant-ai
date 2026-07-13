#!/usr/bin/env python3
"""
Summarize a sort-plan CSV export: reason histogram, automation rate, optional safety vs gold labels.

Expected columns (header row): at minimum `reason`, `target_folder`.
Optional: `filename` for matching to a gold-label file.

Usage (from backend/):
  python -m classify_eval.summarize_export path/to/sort-plan.csv
  python -m classify_eval.summarize_export plan.csv --gold classify_eval/gold_labels.example.json
  python -m classify_eval.summarize_export plan.csv --by-extraction

Gold file: JSON array of {"match": "substring or glob on basename", "gold_folder": "Expected"}.
First matching entry wins per row.

--by-extraction adds histograms by extraction_source and coarse extraction_quality buckets
(uses EXTRACTION_UNCERTAIN_QUALITY from constants when importable).
"""

from __future__ import annotations

import argparse
import csv
import fnmatch
import json
import pathlib
import sys

_UNCERTAIN = "Uncertain"

try:
    from constants import EXTRACTION_UNCERTAIN_QUALITY as _EXTRACTION_UNCERTAIN_FLOOR
except ImportError:
    _EXTRACTION_UNCERTAIN_FLOOR = 0.35

try:
    from .eval_metrics import confusion_from_csv_rows, margin_histogram_from_csv
except ImportError:
    confusion_from_csv_rows = None  # type: ignore[misc, assignment]
    margin_histogram_from_csv = None  # type: ignore[misc, assignment]


def _norm(s: str) -> str:
    return (s or "").strip()


def _load_gold(path: pathlib.Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("gold file must be a JSON array")
    return raw


def _gold_for(filename: str, rules: list[dict]) -> str | None:
    base = pathlib.Path(filename).name.lower()
    for r in rules:
        pat = _norm(str(r.get("match", "")))
        if not pat:
            continue
        if "*" in pat or "?" in pat:
            if fnmatch.fnmatch(base, pat.lower()):
                return _norm(str(r.get("gold_folder", ""))) or None
        else:
            if pat.lower() in base:
                return _norm(str(r.get("gold_folder", ""))) or None
    return None


def _parse_extraction_quality(row: dict) -> float | None:
    raw = row.get("extraction_quality", "")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _extraction_quality_bucket(q: float | None, uncertain_floor: float) -> str:
    if q is None:
        return "quality_missing"
    if q < uncertain_floor:
        return f"quality_low_lt_{uncertain_floor:g}"
    if q < 0.55:
        return "quality_mid_lt_0.55"
    return "quality_high_ge_0.55"


def summarize(
    rows: list[dict],
    gold_rules: list[dict] | None,
    *,
    include_extraction_breakdown: bool = False,
) -> dict:
    from collections import Counter

    reasons = Counter()
    n = 0
    auto = 0
    safety_denom = 0
    safety_num = 0
    by_source = Counter()
    by_quality_bucket = Counter()

    for row in rows:
        n += 1
        reason = _norm(row.get("reason", ""))
        if reason:
            reasons[reason] += 1
        target = _norm(row.get("target_folder", ""))
        if target.lower() != _UNCERTAIN.lower():
            auto += 1

        if gold_rules:
            fn = _norm(row.get("filename", "")) or _norm(row.get("source_path", ""))
            g = _gold_for(fn, gold_rules) if fn else None
            if g is None:
                pass
            elif target.lower() == _UNCERTAIN.lower():
                pass
            else:
                safety_denom += 1
                if target.lower() == g.lower():
                    safety_num += 1

        if include_extraction_breakdown:
            src = _norm(row.get("extraction_source", "")) or "(empty)"
            by_source[src] += 1
            q = _parse_extraction_quality(row)
            by_quality_bucket[_extraction_quality_bucket(q, _EXTRACTION_UNCERTAIN_FLOOR)] += 1

    out = {
        "rows": n,
        "automation_rate": (auto / n) if n else 0.0,
        "reason_histogram": dict(reasons.most_common()),
    }
    if gold_rules and safety_denom:
        out["safety_rate_labeled_auto"] = safety_num / safety_denom
        out["safety_pairs"] = f"{safety_num}/{safety_denom}"
    elif gold_rules:
        out["safety_rate_labeled_auto"] = None
        out["safety_pairs"] = "0/0 (no gold matches or all Uncertain)"
    if include_extraction_breakdown:
        out["extraction_source_histogram"] = dict(by_source.most_common())
        out["extraction_quality_bucket_histogram"] = dict(by_quality_bucket.most_common())
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize sort-plan CSV exports.")
    parser.add_argument("csv_path", type=pathlib.Path, help="Exported sort-plan .csv")
    parser.add_argument(
        "--gold",
        type=pathlib.Path,
        default=None,
        help="Optional JSON gold list (see classify_eval/gold_labels.example.json)",
    )
    parser.add_argument(
        "--by-extraction",
        action="store_true",
        help="Print extraction_source and extraction_quality bucket histograms (needs those CSV columns)",
    )
    parser.add_argument(
        "--confusion",
        action="store_true",
        help="Print pred vs gold pair counts (needs suggested_folder and target_folder columns)",
    )
    parser.add_argument(
        "--margin-hist",
        action="store_true",
        help="Print histogram of candidate_margin_top12 when that column exists",
    )
    args = parser.parse_args()

    if not args.csv_path.is_file():
        print("File not found:", args.csv_path, file=sys.stderr)
        return 1

    gold_rules: list[dict] | None = None
    if args.gold:
        if not args.gold.is_file():
            print("Gold file not found:", args.gold, file=sys.stderr)
            return 1
        gold_rules = _load_gold(args.gold)

    with args.csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    stats = summarize(rows, gold_rules, include_extraction_breakdown=args.by_extraction)
    print(f"Rows: {stats['rows']}")
    print(f"Automation rate (not {_UNCERTAIN}): {stats['automation_rate']:.1%}")
    print("Reason histogram:")
    for reason, count in sorted(stats["reason_histogram"].items(), key=lambda x: (-x[1], x[0])):
        print(f"  {count:4d}  {reason}")
    if gold_rules:
        sr = stats.get("safety_rate_labeled_auto")
        pairs = stats.get("safety_pairs", "")
        if sr is not None:
            print(f"Safety (auto rows vs gold): {sr:.1%}  ({pairs})")
        else:
            print(f"Safety (auto rows vs gold): n/a  ({pairs})")
    if args.by_extraction:
        print("Extraction source (row counts):")
        for src, count in sorted(
            stats.get("extraction_source_histogram", {}).items(), key=lambda x: (-x[1], x[0])
        ):
            print(f"  {count:4d}  {src}")
        print("Extraction quality buckets (uses EXTRACTION_UNCERTAIN_QUALITY for low band):")
        for bucket, count in sorted(
            stats.get("extraction_quality_bucket_histogram", {}).items(), key=lambda x: (-x[1], x[0])
        ):
            print(f"  {count:4d}  {bucket}")
    if args.confusion and confusion_from_csv_rows:
        cstats = confusion_from_csv_rows(rows)
        print("\nPred vs gold (top pairs):")
        for item in cstats.get("pred_vs_gold_top", [])[:25]:
            print(f"  {item['count']:4d}  {item['pred']!r} → {item['gold']!r}")
    if args.margin_hist and margin_histogram_from_csv:
        mh = margin_histogram_from_csv(rows)
        if mh:
            print("\nMargin histogram (candidate_margin_top12):")
            for k, v in mh.items():
                print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
