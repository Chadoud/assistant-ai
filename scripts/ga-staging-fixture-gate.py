#!/usr/bin/env python3
"""
Run classify_eval fixtures on staging LiteLLM and compare to a recorded baseline (±2% gate).

Usage:
  python scripts/ga-staging-fixture-gate.py
  python scripts/ga-staging-fixture-gate.py --write-baseline   # record current run as baseline
  GA_CORPUS_TOLERANCE=0.02 python scripts/ga-staging-fixture-gate.py

Baseline: backend/classify_eval/baseline_staging_fixture.json
Report:   reports/sort-capacity/staging-fixture-gate-<timestamp>.json
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
BASELINE_PATH = BACKEND / "classify_eval" / "baseline_staging_fixture.json"
REPORT_DIR = ROOT / "reports" / "sort-capacity"
LLM_BASE = os.environ.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch").rstrip("/")
API_BASE = os.environ.get("CLOUD_API_BASE", "https://api.exosites.ch").rstrip("/")
TOLERANCE = float(os.environ.get("GA_CORPUS_TOLERANCE", "0.02"))


def _http_json(method: str, url: str, *, body: dict | None = None, headers: dict | None = None, timeout: int = 25) -> dict:
    req_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            raise exc


def _read_cloud_node_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for name in (".env",):
        path = ROOT / "cloud-node" / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"')
    return env


def _mint_via_master_key() -> str:
    cloud = _read_cloud_node_env()
    master = os.environ.get("LITELLM_MASTER_KEY", "").strip() or cloud.get("LITELLM_MASTER_KEY", "")
    if not master:
        raise RuntimeError("no LITELLM_MASTER_KEY")
    models = [
        m.strip()
        for m in (cloud.get("SORT_LLM_MODELS") or "mistral,nomic-embed-text,moondream").split(",")
        if m.strip()
    ]
    gen = _http_json(
        "POST",
        f"{LLM_BASE}/key/generate",
        body={
            "key_alias": f"ga-fixture-gate-{int(time.time())}",
            "duration": "1h",
            "models": models,
            "max_parallel_requests": int(cloud.get("SORT_LLM_MAX_PARALLEL") or 2),
        },
        headers={"Authorization": f"Bearer {master}"},
    )
    tok = str(gen.get("key") or gen.get("token") or "").strip()
    if not tok:
        raise RuntimeError("key/generate returned no token")
    return tok


def _mint_sort_token() -> str:
    token = os.environ.get("SORT_LLM_TOKEN", "").strip()
    if token:
        return token

    verify_env = ROOT / "cloud-node" / ".env.verify"
    email = password = ""
    if verify_env.is_file():
        for line in verify_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("GA_VERIFY_EMAIL="):
                email = line.split("=", 1)[1].strip()
            elif line.startswith("GA_VERIFY_PASSWORD="):
                password = line.split("=", 1)[1].strip()
    access = ""
    if email and password:
        try:
            login = _http_json("POST", f"{API_BASE}/auth/login", body={"email": email, "password": password})
            access = str(login.get("access_token") or "").strip()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            pass

    if access:
        try:
            creds = _http_json(
                "POST",
                f"{LLM_BASE}/v1/sort/credentials",
                body={},
                headers={"Authorization": f"Bearer {access}"},
            )
            tok = str(creds.get("token") or "").strip()
            if tok:
                return tok
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError):
            pass

    if not access:
        try:
            probe_email = f"fixture-gate-{int(time.time())}@example.com"
            reg = _http_json(
                "POST",
                f"{API_BASE}/auth/register",
                body={"email": probe_email, "password": "readiness123", "first_name": "Fixture", "last_name": "Gate"},
            )
            access = str(reg.get("access_token") or "").strip()
            if access:
                creds = _http_json(
                    "POST",
                    f"{LLM_BASE}/v1/sort/credentials",
                    body={},
                    headers={"Authorization": f"Bearer {access}"},
                )
                tok = str(creds.get("token") or "").strip()
                if tok:
                    return tok
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise

    print("==> Broker/register unavailable; using LITELLM_MASTER_KEY /key/generate")
    return _mint_via_master_key()


def _run_fixture_eval(token: str, json_out: Path) -> dict:
    env = os.environ.copy()
    # Avoid stale desktop overrides (expired virtual keys) during GA eval.
    env.pop("EXOSITES_USER_DATA", None)
    env.update(
        {
            "OLLAMA_MODE": "remote",
            "OLLAMA_HOST": LLM_BASE,
            "OLLAMA_API_KEY": token,
            "EXOSITES_REMOTE_LLM": "1",
        }
    )
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "classify_eval.run_eval",
            "--model",
            os.environ.get("GA_FIXTURE_MODEL", "mistral"),
            "--json-out",
            str(json_out),
        ],
        cwd=str(BACKEND),
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stdout[-2000:])
        print(proc.stderr[-1000:], file=sys.stderr)
        raise RuntimeError(f"run_eval failed exit={proc.returncode}")
    return json.loads(json_out.read_text(encoding="utf-8"))


def _metric_snapshot(report: dict) -> dict:
    metrics = report.get("metrics") or {}
    return {
        "cases_run": len(report.get("rows") or []),
        "top1_accuracy": metrics.get("top1_accuracy"),
        "top1_correct": metrics.get("top1_correct"),
        "labeled_count": metrics.get("labeled_count"),
        "gates_accuracy": metrics.get("gates_accuracy"),
        "gates_correct": metrics.get("gates_correct"),
        "gates_labeled_count": metrics.get("gates_labeled_count"),
        "error_rows": metrics.get("error_rows"),
        "model": report.get("model"),
        "llm_base_url": LLM_BASE,
    }


def _within_tolerance(baseline: float | None, candidate: float | None, tol: float) -> bool:
    if baseline is None or candidate is None:
        return baseline is None and candidate is None
    return abs(candidate - baseline) <= tol


def main() -> int:
    write_baseline = os.environ.get("GA_WRITE_FIXTURE_BASELINE", "0").strip().lower() in ("1", "true", "yes")
    if "--write-baseline" in sys.argv:
        write_baseline = True

    print(f"==> Staging fixture eval on {LLM_BASE} (tolerance ±{TOLERANCE:.0%})")
    token = _mint_sort_token()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    scratch = REPORT_DIR / f"_fixture-eval-{stamp}.json"
    report = _run_fixture_eval(token, scratch)
    snapshot = _metric_snapshot(report)

    out_path = REPORT_DIR / f"staging-fixture-gate-{stamp}.json"
    payload: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate": snapshot,
        "passed": True,
    }

    if write_baseline:
        BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        baseline_doc = {
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "source": str(scratch.name),
            **snapshot,
        }
        BASELINE_PATH.write_text(json.dumps(baseline_doc, indent=2) + "\n", encoding="utf-8")
        print(f"==> Wrote baseline {BASELINE_PATH}")
        payload["baseline_written"] = str(BASELINE_PATH)
        out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        scratch.unlink(missing_ok=True)
        print("OK: baseline recorded")
        return 0

    if not BASELINE_PATH.is_file():
        print(f"FAIL: no baseline at {BASELINE_PATH} — run with --write-baseline after a good staging run")
        return 1

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    payload["baseline"] = baseline
    fail = 0

    for key in ("top1_accuracy", "gates_accuracy"):
        b_val = baseline.get(key)
        c_val = snapshot.get(key)
        if b_val is None and c_val is None:
            continue
        ok = _within_tolerance(
            float(b_val) if b_val is not None else None,
            float(c_val) if c_val is not None else None,
            TOLERANCE,
        )
        label = f"{key}: baseline={b_val} candidate={c_val}"
        if ok:
            print(f"PASS: {label}")
        else:
            print(f"FAIL: {label} (delta > {TOLERANCE:.0%})")
            fail = 1

    b_errors = int(baseline.get("error_rows") or 0)
    c_errors = int(snapshot.get("error_rows") or 0)
    if c_errors > b_errors:
        print(f"FAIL: error_rows increased {b_errors} -> {c_errors}")
        fail = 1
    else:
        print(f"PASS: error_rows {c_errors} (baseline {b_errors})")

    payload["passed"] = fail == 0
    payload["tolerance"] = TOLERANCE
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"==> Wrote {out_path}")

    if fail:
        print("FAIL: staging fixture gate")
        return 1
    print("OK: staging fixture gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
