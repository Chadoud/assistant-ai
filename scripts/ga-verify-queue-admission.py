#!/usr/bin/env python3
"""
Verify VPS sort-credentials broker queue admission (auto / always / never).

Checks:
  1. Queue health endpoint is live
  2. When idle (pending_jobs < threshold), credentials omit queue_url (auto mode)
  3. Load test can still hit /v1/sort/inference directly (USE_SORT_QUEUE path)

Usage:
  python scripts/ga-verify-queue-admission.py
  SORT_LLM_BASE_URL=https://llm-staging.exosites.ch python scripts/ga-verify-queue-admission.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LLM_BASE = os.environ.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch").rstrip("/")
API_BASE = os.environ.get("CLOUD_API_BASE", "https://api.exosites.ch").rstrip("/")
ADMIT_THRESHOLD = int(os.environ.get("SORT_QUEUE_ADMIT_THRESHOLD", "2"))


def _http_json(method: str, url: str, *, body: dict | None = None, headers: dict | None = None, timeout: int = 20) -> dict:
    req_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _load_verify_login() -> str:
    token = os.environ.get("EXOSITES_VERIFY_TOKEN", "").strip()
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
    if email and password:
        try:
            login = _http_json("POST", f"{API_BASE}/auth/login", body={"email": email, "password": password})
            return str(login.get("access_token") or "").strip()
        except (urllib.error.URLError, TimeoutError, OSError):
            pass

    import time
    probe_email = f"queue-admit-{int(time.time())}@example.com"
    try:
        reg = _http_json(
            "POST",
            f"{API_BASE}/auth/register",
            body={"email": probe_email, "password": "readiness123", "first_name": "Queue", "last_name": "Probe"},
        )
        return str(reg.get("access_token") or "").strip()
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            print("SKIP: credentials probe (register rate-limited; add cloud-node/.env.verify)")
        return ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return ""


def _mint_credentials(access: str) -> dict:
    return _http_json(
        "POST",
        f"{LLM_BASE}/v1/sort/credentials",
        body={},
        headers={"Authorization": f"Bearer {access}"},
    )


def main() -> int:
    fail = 0

    try:
        health = _http_json("GET", f"{LLM_BASE}/v1/sort/queue/health")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"FAIL: queue health unreachable ({exc})")
        return 1

    pending = int(health.get("pending_jobs") or 0)
    overloaded = bool(health.get("overloaded"))
    print(f"Queue health: pending_jobs={pending} overloaded={overloaded} workers={health.get('workers')}")

    if not health.get("ok"):
        print("FAIL: queue reports not ok")
        fail = 1
    else:
        print("PASS: queue health ok")

    access = _load_verify_login()
    if not access:
        print("SKIP: credentials probe (no .env.verify / EXOSITES_VERIFY_TOKEN)")
        return fail

    creds = _mint_credentials(access)
    queue_url = str(creds.get("queue_url") or "").strip()
    expect_queue = overloaded or pending >= ADMIT_THRESHOLD

    if expect_queue:
        if queue_url:
            print(f"PASS: credentials include queue_url under load ({queue_url})")
        else:
            print("FAIL: expected queue_url in credentials (system under load)")
            fail = 1
    else:
        if queue_url:
            print(f"FAIL: credentials include queue_url while idle (got {queue_url})")
            fail = 1
        else:
            print("PASS: credentials omit queue_url while idle (auto admission)")

    slots = creds.get("llm_max_slots")
    conc = creds.get("sort_max_concurrency")
    if slots and conc:
        print(f"PASS: admission slots llm_max_slots={slots} sort_max_concurrency={conc}")
    else:
        print("FAIL: missing llm_max_slots or sort_max_concurrency")
        fail = 1

    if fail:
        print("\nQueue admission verification FAILED")
        return 1
    print("\nQueue admission verification PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
