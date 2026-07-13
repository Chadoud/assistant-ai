from __future__ import annotations

import pathlib
import subprocess
import sys


def test_kpi_guardrails_fixture_passes() -> None:
    backend = pathlib.Path(__file__).resolve().parents[1]
    sort_plan = backend / "classify_eval" / "fixtures" / "baseline_sort_plan.csv"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "classify_eval.kpi_guardrails",
            "--sort-plan",
            str(sort_plan),
            "--max-uncertain-rate",
            "0.60",
            "--max-error-rate",
            "0.10",
            "--max-p90-ms",
            "5000",
        ],
        cwd=str(backend),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + "\n" + proc.stderr
