#!/usr/bin/env python3
"""
Simulate N cloud-sort users hammering staging LiteLLM at once.

Each virtual user gets its own LiteLLM key (like real accounts), runs classify +
embed requests with per-user concurrency aligned to SORT_LLM_MAX_PARALLEL.

Usage:
  # Staging (needs LITELLM_MASTER_KEY in cloud-node/.env or env):
  python3 scripts/ga-sort-concurrency-load-test.py

  USERS=5 REQUESTS_PER_USER=2 CONCURRENCY_PER_USER=2 \\
    SORT_LLM_BASE_URL=https://llm-staging.exosites.ch \\
    LITELLM_MASTER_KEY=sk-... \\
    python3 scripts/ga-sort-concurrency-load-test.py

Exit 0 when error rate <= MAX_ERROR_RATE and p95 latency <= MAX_P95_MS.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

LLM_BASE = os.environ.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch").rstrip("/")
MASTER_KEY = os.environ.get("LITELLM_MASTER_KEY", "").strip()
USE_SORT_QUEUE = os.environ.get("USE_SORT_QUEUE", "0").strip().lower() in ("1", "true", "yes")
REPORT_PATH = os.environ.get("CAPACITY_REPORT_PATH", "").strip()
USERS = max(1, int(os.environ.get("USERS", "5")))
REQUESTS_PER_USER = max(1, int(os.environ.get("REQUESTS_PER_USER", "2")))
# Match VPS admission: one analyze row per user (sort_max_concurrency=1).
CONCURRENCY_PER_USER = max(1, int(os.environ.get("CONCURRENCY_PER_USER", "1")))
MAX_ERROR_RATE = float(os.environ.get("MAX_ERROR_RATE", "0.15"))
MAX_P95_MS = int(os.environ.get("MAX_P95_MS", "120000"))
REQUEST_TIMEOUT_S = int(os.environ.get("LOAD_TEST_TIMEOUT_S", "600" if USE_SORT_QUEUE else "180"))
SORT_MODELS = [
    m.strip()
    for m in os.environ.get("SORT_LLM_MODELS", "mistral,nomic-embed-text").split(",")
    if m.strip()
]
CHAT_MODEL = os.environ.get("LOAD_TEST_CHAT_MODEL", SORT_MODELS[0] if SORT_MODELS else "mistral")
EMBED_MODEL = os.environ.get(
    "LOAD_TEST_EMBED_MODEL",
    next((m for m in SORT_MODELS if "embed" in m.lower()), "nomic-embed-text"),
)

CLASSIFY_PROMPT = (
    "Classify this document into one folder name only.\n"
    "Document: Invoice #1042 from Acme Corp, due 2026-03-01, total CHF 420.00.\n"
    "Folders: Invoices, Bank Statements, Contracts, Uncertain.\n"
    "Reply with the folder name only."
)
EMBED_TEXT = "Invoice #1042 from Acme Corp due March 2026 total CHF 420"


@dataclass
class RequestResult:
    user_id: int
    kind: str
    status: int
    latency_ms: int
    error: str = ""


@dataclass
class UserStats:
    user_id: int
    results: list[RequestResult] = field(default_factory=list)


def _load_master_key() -> str:
    if MASTER_KEY:
        return MASTER_KEY
    env_file = ROOT / "cloud-node" / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("LITELLM_MASTER_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(
        "Set LITELLM_MASTER_KEY or add it to cloud-node/.env to mint per-user virtual keys."
    )


def _http_json(
    method: str,
    url: str,
    *,
    token: str,
    body: dict | None = None,
    timeout_s: int = REQUEST_TIMEOUT_S,
) -> tuple[int, dict]:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:240]
        try:
            payload = json.loads(detail) if detail.startswith("{") else {}
        except ValueError:
            payload = {}
        return exc.code, payload if isinstance(payload, dict) else {"detail": detail}


def _mint_user_key(master: str, user_id: int) -> str:
    body = {
        "key_alias": f"load-test-user-{user_id}-{int(time.time())}",
        "duration": "1h",
        "models": SORT_MODELS,
        "max_parallel_requests": CONCURRENCY_PER_USER,
    }
    status, data = _http_json("POST", f"{LLM_BASE}/key/generate", token=master, body=body, timeout_s=30)
    if status >= 400:
        raise SystemExit(f"key/generate failed for user {user_id}: HTTP {status} {data}")
    token = (
        str(data.get("key") or "")
        or str(data.get("token") or "")
        or str((data.get("key_info") or {}).get("key") or "")
    ).strip()
    if not token:
        raise SystemExit(f"key/generate returned no token for user {user_id}")
    return token


def _classify(token: str, user_id: int) -> RequestResult:
    started = time.perf_counter()
    body = {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": CLASSIFY_PROMPT}],
        "temperature": 0.1,
    }
    if USE_SORT_QUEUE:
        status, data = _http_json(
            "POST",
            f"{LLM_BASE}/v1/sort/inference",
            token=token,
            body={"method": "POST", "path": "/v1/chat/completions", "body": body},
        )
    else:
        status, data = _http_json(
            "POST",
            f"{LLM_BASE}/v1/chat/completions",
            token=token,
            body=body,
        )
    latency_ms = int((time.perf_counter() - started) * 1000)
    err = ""
    if status >= 400:
        err = str(data.get("error") or data.get("detail") or f"HTTP {status}")[:120]
    return RequestResult(user_id, "classify", status, latency_ms, err)


def _embed(token: str, user_id: int) -> RequestResult:
    started = time.perf_counter()
    body = {"model": EMBED_MODEL, "input": EMBED_TEXT}
    if USE_SORT_QUEUE:
        status, data = _http_json(
            "POST",
            f"{LLM_BASE}/v1/sort/inference",
            token=token,
            body={"method": "POST", "path": "/v1/embeddings", "body": body},
            timeout_s=REQUEST_TIMEOUT_S,
        )
    else:
        status, data = _http_json(
            "POST",
            f"{LLM_BASE}/v1/embeddings",
            token=token,
            body=body,
            timeout_s=min(REQUEST_TIMEOUT_S, 90),
        )
    latency_ms = int((time.perf_counter() - started) * 1000)
    err = ""
    if status >= 400:
        err = str(data.get("error") or data.get("detail") or f"HTTP {status}")[:120]
    return RequestResult(user_id, "embed", status, latency_ms, err)


def _run_user(user_id: int, token: str) -> UserStats:
    stats = UserStats(user_id=user_id)
    work: list[tuple[str, str]] = []
    for _ in range(REQUESTS_PER_USER):
        work.append(("classify", token))
        work.append(("embed", token))

    def _one(item: tuple[str, str]) -> RequestResult:
        kind, key = item
        if kind == "classify":
            return _classify(key, user_id)
        return _embed(key, user_id)

    if CONCURRENCY_PER_USER <= 1:
        for item in work:
            stats.results.append(_one(item))
        return stats

    with ThreadPoolExecutor(max_workers=CONCURRENCY_PER_USER) as pool:
        futures = [pool.submit(_one, item) for item in work]
        for fut in as_completed(futures):
            stats.results.append(fut.result())
    return stats


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round((pct / 100.0) * (len(ordered) - 1)))))
    return ordered[idx]


def main() -> int:
    master = _load_master_key()
    mode = "queue" if USE_SORT_QUEUE else "direct"
    print(f"==> Load test ({mode}): {USERS} users × {REQUESTS_PER_USER} classify+embed rounds")
    print(f"    gateway={LLM_BASE} concurrency/user={CONCURRENCY_PER_USER}")
    print(f"    models: chat={CHAT_MODEL} embed={EMBED_MODEL}")

    user_tokens: list[tuple[int, str]] = []
    for user_id in range(1, USERS + 1):
        user_tokens.append((user_id, _mint_user_key(master, user_id)))
    print(f"==> Minted {len(user_tokens)} virtual keys")

    started = time.perf_counter()
    all_stats: list[UserStats] = []
    with ThreadPoolExecutor(max_workers=USERS) as pool:
        futures = [pool.submit(_run_user, uid, tok) for uid, tok in user_tokens]
        for fut in as_completed(futures):
            all_stats.append(fut.result())
    wall_ms = int((time.perf_counter() - started) * 1000)

    results = [r for s in all_stats for r in s.results]
    ok = [r for r in results if r.status < 400]
    errors = [r for r in results if r.status >= 400]
    latencies = [r.latency_ms for r in ok]
    p50 = _percentile(latencies, 50)
    p95 = _percentile(latencies, 95)
    error_rate = len(errors) / max(1, len(results))

    status_counts: dict[int, int] = {}
    for r in results:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1

    print(f"\n==> Results ({len(results)} requests in {wall_ms} ms wall time)")
    print(f"    success: {len(ok)}  errors: {len(errors)}  error_rate: {error_rate:.1%}")
    print(f"    latency p50: {p50} ms   p95: {p95} ms")
    print(f"    status codes: {dict(sorted(status_counts.items()))}")

    if errors:
        sample = errors[:5]
        print("    sample errors:")
        for r in sample:
            print(f"      user={r.user_id} {r.kind} HTTP {r.status} {r.error}")

    passed = error_rate <= MAX_ERROR_RATE and p95 <= MAX_P95_MS

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "llm_base_url": LLM_BASE,
        "use_sort_queue": USE_SORT_QUEUE,
        "users": USERS,
        "requests_per_user": REQUESTS_PER_USER,
        "concurrency_per_user": CONCURRENCY_PER_USER,
        "total_requests": len(results),
        "wall_ms": wall_ms,
        "success_count": len(ok),
        "error_count": len(errors),
        "error_rate": round(error_rate, 4),
        "latency_p50_ms": p50,
        "latency_p95_ms": p95,
        "status_codes": {str(k): v for k, v in sorted(status_counts.items())},
        "max_error_rate": MAX_ERROR_RATE,
        "max_p95_ms": MAX_P95_MS,
        "passed": passed,
    }
    if REPORT_PATH:
        out = Path(REPORT_PATH)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if passed:
        print(
            f"\nOK: within limits (error_rate <= {MAX_ERROR_RATE:.0%}, p95 <= {MAX_P95_MS} ms)"
        )
        return 0

    print(
        f"\nFAIL: error_rate {error_rate:.1%} (max {MAX_ERROR_RATE:.0%}) "
        f"or p95 {p95} ms (max {MAX_P95_MS} ms)"
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
