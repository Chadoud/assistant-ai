#!/usr/bin/env python3
"""
One-command closed-beta kickoff — run all automated pre-invite gates.

Usage:
  python scripts/ga-closed-beta-kickoff.py
  python scripts/ga-closed-beta-kickoff.py --skip-slow   # skip fixture gate + capacity
  python scripts/ga-closed-beta-kickoff.py --provision-verify
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports" / "closed-beta-kickoff"
VERIFY_ENV = ROOT / "cloud-node" / ".env.verify"
API_BASE = os.environ.get("CLOUD_API_BASE", "https://api.exosites.ch").rstrip("/")


def _run(label: str, cmd: list[str], *, env: dict | None = None) -> dict:
    print(f"\n==> {label}")
    proc = subprocess.run(
        cmd,
        cwd=str(ROOT),
        env={**os.environ, **(env or {})},
        capture_output=True,
        text=True,
    )
    tail = (proc.stdout + proc.stderr).strip()[-2500:]
    ok = proc.returncode == 0
    print(tail[-1200:] if tail else f"(exit {proc.returncode})")
    print("PASS" if ok else "FAIL")
    return {"label": label, "ok": ok, "exit_code": proc.returncode, "output_tail": tail}


def _http_json(method: str, url: str, *, body: dict | None = None, timeout: int = 20) -> tuple[int, dict]:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"detail": raw[:200]}
        return exc.code, payload


def _provision_verify() -> dict:
    email = os.environ.get("GA_VERIFY_EMAIL", "ga-verify@exosites.ch").strip()
    password = os.environ.get("GA_VERIFY_PASSWORD", "").strip()

    if VERIFY_ENV.is_file() and not password:
        for line in VERIFY_ENV.read_text(encoding="utf-8").splitlines():
            if line.startswith("GA_VERIFY_PASSWORD="):
                password = line.split("=", 1)[1].strip()
            elif line.startswith("GA_VERIFY_EMAIL=") and not email:
                email = line.split("=", 1)[1].strip()

    if not password:
        password = secrets.token_urlsafe(18)
        VERIFY_ENV.write_text(
            f"GA_VERIFY_EMAIL={email}\nGA_VERIFY_PASSWORD={password}\n",
            encoding="utf-8",
        )
        print(f"==> Wrote {VERIFY_ENV} (gitignored) with new password")

    code, _ = _http_json("POST", f"{API_BASE}/auth/login", body={"email": email, "password": password})
    if code == 200:
        print(f"PASS: verify login {email}")
        return {"label": "provision_verify", "ok": True, "email": email}

    code, body = _http_json(
        "POST",
        f"{API_BASE}/auth/register",
        body={"email": email, "password": password, "first_name": "GA", "last_name": "Verify"},
    )
    if code == 200:
        print(f"PASS: created verify account {email}")
        return {"label": "provision_verify", "ok": True, "email": email, "created": True}

    if code == 409 or str(body.get("detail", "")).lower().find("already") >= 0:
        print(f"WARN: {email} already exists — set GA_VERIFY_PASSWORD in cloud-node/.env.verify to match")
        return {"label": "provision_verify", "ok": None, "warn": True, "email": email}

    detail = str(body.get("detail", "")).lower()
    if code == 429 or "rate_limit" in detail:
        print("WARN: register rate-limited — set cloud-node/.env.verify with the ga-verify password")
        return {"label": "provision_verify", "ok": None, "warn": True}

    print(f"FAIL: verify account login/register (register={body})")
    return {"label": "provision_verify", "ok": False, "detail": body}


def main() -> int:
    parser = argparse.ArgumentParser(description="Closed-beta automated kickoff")
    parser.add_argument("--skip-slow", action="store_true", help="Skip fixture gate and capacity baseline")
    parser.add_argument("--provision-verify", action="store_true", help="Create/confirm ga-verify account")
    args = parser.parse_args()

    py = sys.executable
    steps: list[dict] = []

    if args.provision_verify or not VERIFY_ENV.is_file():
        steps.append(_provision_verify())

    steps.append(_run("beta_health", [py, "scripts/ga-beta-health.py"]))
    steps.append(_run("queue_admission", [py, "scripts/ga-verify-queue-admission.py"]))

    # Optional: set VPS_SSH_KEY / VPS_SSH in the environment for SSH health checks.
    steps.append(
        _run("beta_health_prometheus", [py, "scripts/ga-beta-health.py", "--ssh-check-prometheus"])
    )

    if not args.skip_slow:
        steps.append(_run("staging_fixture_gate", [py, "scripts/ga-staging-fixture-gate.py"]))
        steps.append(
            _run(
                "sort_capacity_queue",
                [py, "scripts/ga-sort-capacity-baseline.py"],
                env={"USE_SORT_QUEUE": "1"},
            )
        )

    deploy_env = ROOT / "cloud-node" / ".env.deploy"
    if deploy_env.is_file() and shutil.which("bash"):
        steps.append(_run("deploy_cloud_api", ["bash", "scripts/deploy-cloud-api.sh"]))
    elif deploy_env.is_file():
        print("\n==> deploy_cloud_api SKIPPED (bash not available — run on Linux/macOS or Git Bash)")
        steps.append({"label": "deploy_cloud_api", "ok": None, "skipped": True})
    else:
        print("\n==> deploy_cloud_api SKIPPED (no cloud-node/.env.deploy)")
        steps.append({"label": "deploy_cloud_api", "ok": None, "skipped": True})

    fail = sum(1 for s in steps if s.get("ok") is False)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "steps": steps,
        "passed": fail == 0,
    }
    out = REPORT_DIR / f"kickoff-{stamp}.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"\n==> Report: {out}")
    if fail:
        print(f"FAIL: {fail} step(s) — fix before sending invites")
        return 1

    print("\nOK: automated closed-beta kickoff passed")
    print("\nManual (before invites):")
    print("  1. Restart Exo -> sign in -> sort 10+ mixed files")
    print("  2. Settings -> Vision -> confirm moondream")
    print("  3. Send invites (template in docs/CLOSED_BETA.md)")
    print("  4. Daily: npm run ga:beta-health")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
