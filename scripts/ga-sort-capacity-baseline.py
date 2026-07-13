#!/usr/bin/env python3
"""
Record capacity baseline for cloud sort (direct LiteLLM vs optional Redis queue).

Runs load test at 5 simulated users (official GA concurrency target).

Usage:
  ./scripts/ga-sort-capacity-baseline.sh
  USE_SORT_QUEUE=1 ./scripts/ga-sort-capacity-baseline.sh

Override user count: BASELINE_USERS=5 (default) or comma list BASELINE_USERS=5,8

Report: reports/sort-capacity/sort-capacity-YYYY-MM-DDTHHMMSSZ.json
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOAD_SCRIPT = ROOT / "scripts" / "ga-sort-concurrency-load-test.py"
REPORT_DIR = ROOT / "reports" / "sort-capacity"
DEFAULT_BASELINE_USERS = (5,)


def _baseline_user_counts() -> tuple[int, ...]:
    raw = os.environ.get("BASELINE_USERS", "").strip()
    if not raw:
        return DEFAULT_BASELINE_USERS
    counts = tuple(max(1, int(part.strip())) for part in raw.split(",") if part.strip())
    return counts or DEFAULT_BASELINE_USERS


def _flush_sort_queue_redis() -> None:
    """Drop stale jobs from aborted load tests so queue baselines stay honest."""
    flush_cmd = os.environ.get("BASELINE_REDIS_FLUSH_CMD", "").strip()
    if flush_cmd:
        subprocess.run(flush_cmd, shell=True, check=False)
        return
    key = os.environ.get("VPS_SSH_KEY", "").strip()
    if not key:
        return
    ssh = os.environ.get("VPS_SSH", "").strip()
    if not ssh:
        return
    subprocess.run(
        ["ssh", "-i", key, "-o", "StrictHostKeyChecking=accept-new", ssh,
         "docker exec litellm-redis redis-cli FLUSHDB && docker restart sort-queue >/dev/null"],
        check=False,
    )
    import time
    time.sleep(8)


def _run_scenario(*, users: int, use_queue: bool) -> dict:
    env = os.environ.copy()
    env["USERS"] = str(users)
    env["REQUESTS_PER_USER"] = env.get("BASELINE_REQUESTS_PER_USER", "2")
    env.setdefault("CONCURRENCY_PER_USER", "2")
    env["MAX_ERROR_RATE"] = env.get("BASELINE_MAX_ERROR_RATE", "0.15")
    env["MAX_P95_MS"] = env.get("BASELINE_MAX_P95_MS", "120000")
    env["CAPACITY_REPORT_PATH"] = str(REPORT_DIR / f"_scratch-{users}-{'queue' if use_queue else 'direct'}.json")
    if use_queue:
        env["USE_SORT_QUEUE"] = "1"
        env.setdefault("LOAD_TEST_TIMEOUT_S", "600")
    else:
        env.pop("USE_SORT_QUEUE", None)

    proc = subprocess.run(
        [sys.executable, str(LOAD_SCRIPT)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    scratch = Path(env["CAPACITY_REPORT_PATH"])
    payload: dict = {"users": users, "use_sort_queue": use_queue, "exit_code": proc.returncode}
    if scratch.is_file():
        payload.update(json.loads(scratch.read_text(encoding="utf-8")))
        scratch.unlink(missing_ok=True)
    payload["stdout_tail"] = proc.stdout.strip()[-2000:]
    payload["stderr_tail"] = proc.stderr.strip()[-1000:]
    return payload


def main() -> int:
    use_queue = os.environ.get("USE_SORT_QUEUE", "0").strip().lower() in ("1", "true", "yes")
    if use_queue:
        print("==> Flushing Redis sort queue (remove stale jobs from prior runs)…")
        _flush_sort_queue_redis()

    user_counts = _baseline_user_counts()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    mode = "queue" if use_queue else "direct"
    report_path = REPORT_DIR / f"sort-capacity-{mode}-{stamp}.json"

    scenarios = []
    for users in user_counts:
        print(f"\n==> Baseline: {users} users ({mode})")
        scenarios.append(_run_scenario(users=users, use_queue=use_queue))

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "llm_base_url": os.environ.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch"),
        "use_sort_queue": use_queue,
        "target_concurrent_users": user_counts[0] if len(user_counts) == 1 else list(user_counts),
        "scenarios": scenarios,
        "passed": all(s.get("passed") for s in scenarios),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\n==> Wrote {report_path}")
    print(f"    overall passed: {report['passed']}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
