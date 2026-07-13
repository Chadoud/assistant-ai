#!/usr/bin/env python3
"""
Guardrail checks for sort KPI summaries.

This is intentionally lightweight: it does not call Ollama; it validates that key
aggregate metrics from a sort-plan export do not regress beyond configured bounds.
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import sys

from classify_eval.baseline_kpis import summarize_sort_plan


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail when KPI guardrails regress.")
    parser.add_argument("--sort-plan", type=pathlib.Path, required=True)
    parser.add_argument("--max-uncertain-rate", type=float, default=0.65)
    parser.add_argument("--max-error-rate", type=float, default=0.05)
    parser.add_argument("--max-p90-ms", type=float, default=12000.0)
    args = parser.parse_args()

    if not args.sort_plan.is_file():
        print(f"sort-plan not found: {args.sort_plan}", file=sys.stderr)
        return 2

    with args.sort_plan.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    kpis = summarize_sort_plan(rows)
    uncertain_rate = float(kpis.get("uncertain_rate") or 0.0)
    error_rate = float(kpis.get("error_rate") or 0.0)
    p90 = (kpis.get("analyze_duration_ms") or {}).get("p90")
    p90_f = float(p90) if isinstance(p90, (int, float)) else 0.0

    errors: list[str] = []
    if uncertain_rate > args.max_uncertain_rate:
        errors.append(
            f"uncertain_rate {uncertain_rate:.3f} > max_uncertain_rate {args.max_uncertain_rate:.3f}"
        )
    if error_rate > args.max_error_rate:
        errors.append(f"error_rate {error_rate:.3f} > max_error_rate {args.max_error_rate:.3f}")
    if p90_f > args.max_p90_ms:
        errors.append(f"p90 {p90_f:.1f}ms > max_p90_ms {args.max_p90_ms:.1f}ms")

    if errors:
        print("KPI guardrail failures:")
        for e in errors:
            print(f" - {e}")
        return 1
    print("KPI guardrails: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
