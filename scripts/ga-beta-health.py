#!/usr/bin/env python3
"""
Closed-beta health probe — run daily during the first week of staging invites.

Checks: cloud API, staging + prod LLM, queue health, idle queue admission, optional Prometheus.

Usage:
  python scripts/ga-beta-health.py
  python scripts/ga-beta-health.py --ssh-check-prometheus   # VPS localhost:9090 via SSH

Report: reports/beta-health/beta-health-<timestamp>.json
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports" / "beta-health"
LLM_STAGING = os.environ.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch").rstrip("/")
LLM_PROD = os.environ.get("SORT_LLM_PROD_URL", "https://llm.exosites.ch").rstrip("/")
API_BASE = os.environ.get("CLOUD_API_BASE", "https://api.exosites.ch").rstrip("/")


def _probe_url(url: str, timeout: int = 15) -> dict:
    started = datetime.now(timezone.utc)
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json,*/*"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(512).decode("utf-8", errors="replace")
            return {
                "url": url,
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "body_preview": body[:200],
                "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
            }
    except urllib.error.HTTPError as exc:
        return {
            "url": url,
            "ok": False,
            "status": exc.code,
            "error": str(exc)[:200],
            "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
        }
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "url": url,
            "ok": False,
            "status": None,
            "error": str(exc)[:200],
            "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
        }


def _run_queue_admission() -> dict:
    script = ROOT / "scripts" / "ga-verify-queue-admission.py"
    proc = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    return {
        "ok": proc.returncode == 0,
        "exit_code": proc.returncode,
        "stdout": proc.stdout.strip()[-1500:],
        "stderr": proc.stderr.strip()[-500:],
    }


def _prometheus_via_ssh() -> dict:
    key = os.environ.get("VPS_SSH_KEY", "").strip()
    ssh = os.environ.get("VPS_SSH", "").strip()
    if not key or not ssh or not Path(key).is_file():
        return {"ok": None, "skipped": "no VPS_SSH_KEY/VPS_SSH"}
    cmd = [
        "ssh",
        "-i",
        key,
        "-o",
        "StrictHostKeyChecking=accept-new",
        ssh,
        "curl -fsS http://127.0.0.1:9090/-/healthy && curl -fsS 'http://127.0.0.1:9090/api/v1/targets' | head -c 400",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return {
        "ok": proc.returncode == 0,
        "stdout": proc.stdout.strip()[:500],
        "stderr": proc.stderr.strip()[:300],
    }


def main() -> int:
    ssh_prom = "--ssh-check-prometheus" in sys.argv
    checks: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cloud_api_health": _probe_url(f"{API_BASE}/health"),
        "staging_liveliness": _probe_url(f"{LLM_STAGING}/health/liveliness"),
        "prod_liveliness": _probe_url(f"{LLM_PROD}/health/liveliness"),
        "queue_health": _probe_url(f"{LLM_STAGING}/v1/sort/queue/health"),
        "queue_admission": _run_queue_admission(),
    }
    if ssh_prom:
        checks["prometheus_vps"] = _prometheus_via_ssh()

    hard_fail = 0
    for name in ("cloud_api_health", "staging_liveliness", "queue_health"):
        if not checks[name].get("ok"):
            hard_fail += 1
            print(f"FAIL: {name}")
        else:
            print(f"PASS: {name}")

    qa = checks["queue_admission"]
    if qa.get("ok"):
        print("PASS: queue_admission")
    else:
        print("FAIL: queue_admission")
        hard_fail += 1

    prod = checks["prod_liveliness"]
    if prod.get("ok"):
        print("PASS: prod_liveliness")
    else:
        print(f"WARN: prod_liveliness ({prod.get('error') or prod.get('status')})")

    if ssh_prom and checks.get("prometheus_vps", {}).get("ok") is False:
        print("WARN: prometheus not reachable on VPS (enable SORT_PROMETHEUS_ENABLED=1)")

    checks["passed"] = hard_fail == 0
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    out = REPORT_DIR / f"beta-health-{stamp}.json"
    out.write_text(json.dumps(checks, indent=2) + "\n", encoding="utf-8")
    print(f"==> Wrote {out}")

    if hard_fail:
        print(f"FAIL: {hard_fail} critical check(s)")
        return 1
    print("OK: beta health probe passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
