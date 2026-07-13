"""
Aggregate metrics from classify_eval.run_eval report rows (no Ollama required).

Used for JSON summaries and offline CSV analysis.
"""

from __future__ import annotations

from collections import Counter
from typing import Any


def compute_eval_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute accuracy, margin distribution, and confusion pairs from eval report rows.

    Each row may include: id, pred, gold, margin, gates_ok, after_gates, gold_after_gates, error.
    """
    margins: list[float] = []
    labeled = 0
    correct = 0
    confusion: Counter[tuple[str, str]] = Counter()
    gates_labeled = 0
    gates_correct = 0
    errors = 0

    for row in rows:
        if row.get("error"):
            errors += 1
            continue
        m = row.get("margin")
        if isinstance(m, (int, float)):
            margins.append(float(m))

        gold = row.get("gold")
        if gold is not None:
            labeled += 1
            pred = row.get("pred", "")
            if str(pred).strip().lower() == str(gold).strip().lower():
                correct += 1
            else:
                confusion[(str(pred), str(gold))] += 1

        if row.get("gold_after_gates") is not None:
            gates_labeled += 1
            if row.get("gates_ok") is True:
                gates_correct += 1

    margin_stats: dict[str, Any] | None = None
    if margins:
        margin_stats = {
            "count": len(margins),
            "mean": sum(margins) / len(margins),
            "min": min(margins),
            "max": max(margins),
            "fraction_lt_0.04": sum(1 for x in margins if x < 0.04) / len(margins),
            "fraction_lt_0.08": sum(1 for x in margins if x < 0.08) / len(margins),
            "fraction_lt_0.12": sum(1 for x in margins if x < 0.12) / len(margins),
        }

    confusion_pairs = [
        {"pred": a, "gold": b, "count": c}
        for (a, b), c in confusion.most_common(40)
    ]

    return {
        "labeled_count": labeled,
        "top1_correct": correct,
        "top1_accuracy": (correct / labeled) if labeled else None,
        "gates_labeled_count": gates_labeled,
        "gates_correct": gates_correct,
        "gates_accuracy": (gates_correct / gates_labeled) if gates_labeled else None,
        "error_rows": errors,
        "margin_stats": margin_stats,
        "confusion_pairs": confusion_pairs,
    }


def confusion_from_csv_rows(
    rows: list[dict[str, str]],
    *,
    pred_key: str = "suggested_folder",
    gold_key: str = "target_folder",
) -> dict[str, Any]:
    """
    Pair counts for pred vs gold columns (e.g. sort-plan export), excluding Uncertain if desired later.
    """
    c: Counter[tuple[str, str]] = Counter()
    for row in rows:
        p = (row.get(pred_key) or "").strip()
        g = (row.get(gold_key) or "").strip()
        if not p and not g:
            continue
        c[(p, g)] += 1
    return {
        "pred_vs_gold_top": [
            {"pred": a, "gold": b, "count": n} for (a, b), n in c.most_common(50)
        ]
    }


def margin_histogram_from_csv(
    rows: list[dict[str, str]],
    column: str = "candidate_margin_top12",
    buckets: tuple[float, ...] = (0.0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.2, 1.0),
) -> dict[str, int] | None:
    """Histogram of numeric margin column when present in export CSV."""
    vals: list[float] = []
    for row in rows:
        raw = row.get(column, "")
        if raw is None or str(raw).strip() == "":
            continue
        try:
            vals.append(float(raw))
        except (TypeError, ValueError):
            continue
    if not vals:
        return None
    hist: dict[str, int] = {}
    for i in range(len(buckets) - 1):
        lo, hi = buckets[i], buckets[i + 1]
        label = f"[{lo:g},{hi:g})"
        hist[label] = sum(1 for v in vals if lo <= v < hi)
    hist["n"] = len(vals)
    return hist
