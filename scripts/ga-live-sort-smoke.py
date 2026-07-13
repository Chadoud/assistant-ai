#!/usr/bin/env python3
"""
Live cloud-sort smoke: materialize eval fixtures, run /analyze, poll until review-ready.

Requires Exo dev backend (npm run dev) and managed remote credentials.

Usage:
  python3 scripts/ga-live-sort-smoke.py
  EXO_BACKEND_URL=http://127.0.0.1:7799 python3 scripts/ga-live-sort-smoke.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "backend" / "classify_eval" / "fixtures"
BASE = os.environ.get("EXO_BACKEND_URL", "http://127.0.0.1:7799").rstrip("/")
MIN_OK = int(os.environ.get("GA_LIVE_SORT_MIN_OK", "8"))
TIMEOUT_S = int(os.environ.get("GA_LIVE_SORT_TIMEOUT_S", "1200"))


def _exo_user_data_dir() -> Path:
    """Desktop userData (matches Electron `app.getPath('userData')`)."""
    override = os.environ.get("EXOSITES_USER_DATA", "").strip()
    if override:
        return Path(override)
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA", "")
        if appdata:
            for name in ("Exo", "Exosites AI Manager", "EXO"):
                candidate = Path(appdata) / name
                if candidate.is_dir():
                    return candidate
            return Path(appdata) / "Exo"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/EXO"
    return Path.home() / ".config/Exo"


USER_DATA = _exo_user_data_dir()
TOKEN_FILE = USER_DATA / ".dev-app-token"


def _read_cloud_node_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_file = ROOT / "cloud-node" / ".env"
    if not env_file.is_file():
        return env
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"')
    return env


def _http_json(method: str, url: str, *, body: dict | None = None, headers: dict | None = None, timeout: int = 30) -> dict:
    req_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        req_headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _mint_via_broker() -> tuple[str, str, dict]:
    verify_env = ROOT / "cloud-node" / ".env.verify"
    email = password = ""
    if verify_env.is_file():
        for line in verify_env.read_text(encoding="utf-8").splitlines():
            if line.startswith("GA_VERIFY_EMAIL="):
                email = line.split("=", 1)[1].strip()
            elif line.startswith("GA_VERIFY_PASSWORD="):
                password = line.split("=", 1)[1].strip()
    if not email or not password:
        raise RuntimeError("no .env.verify")

    login = _http_json(
        "POST",
        "https://api.exosites.ch/auth/login",
        body={"email": email, "password": password},
    )
    access = str(login.get("access_token") or "").strip()
    if not access:
        raise RuntimeError("login failed")

    creds = _http_json(
        "POST",
        "https://llm-staging.exosites.ch/v1/sort/credentials",
        body={},
        headers={"Authorization": f"Bearer {access}"},
    )
    host = str(creds.get("endpoint") or "https://llm-staging.exosites.ch").rstrip("/")
    token = str(creds.get("token") or "").strip()
    if not token:
        raise RuntimeError("broker returned no token")
    return host, token, creds


def _mint_via_master_key() -> tuple[str, str, dict]:
    cloud = _read_cloud_node_env()
    master = os.environ.get("LITELLM_MASTER_KEY", "").strip() or cloud.get("LITELLM_MASTER_KEY", "")
    host = os.environ.get("SORT_LLM_BASE_URL", "").strip() or cloud.get("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch")
    host = host.rstrip("/")
    if not master:
        raise RuntimeError("no LITELLM_MASTER_KEY")

    models = [
        m.strip()
        for m in (cloud.get("SORT_LLM_MODELS") or "mistral,nomic-embed-text,moondream").split(",")
        if m.strip()
    ]
    gen = _http_json(
        "POST",
        f"{host}/key/generate",
        body={
            "key_alias": f"ga-live-sort-{int(time.time())}",
            "duration": "1h",
            "models": models,
            "max_parallel_requests": int(cloud.get("SORT_LLM_MAX_PARALLEL") or 2),
        },
        headers={"Authorization": f"Bearer {master}"},
    )
    token = str(gen.get("key") or gen.get("token") or "").strip()
    if not token:
        raise RuntimeError("key/generate returned no token")

    creds: dict = {
        "endpoint": host,
        "token": token,
        "llm_max_slots": int(cloud.get("SORT_LLM_MAX_PARALLEL") or 2),
        "sort_max_concurrency": int(cloud.get("SORT_CLOUD_SORT_CONCURRENCY") or 1),
    }
    return host, token, creds


def _mint_sort_token() -> tuple[str, str, dict]:
    """Mint a virtual sort key via broker (preferred) or LiteLLM master key."""
    try:
        return _mint_via_broker()
    except (RuntimeError, urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"==> Broker mint skipped ({exc}); using master key /key/generate")
        return _mint_via_master_key()


def _ensure_fresh_sort_credentials() -> None:
    host, token, creds = _mint_sort_token()
    overrides_path = USER_DATA / "backend-env-overrides.json"
    overrides_path.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    if overrides_path.is_file():
        data = json.loads(overrides_path.read_text(encoding="utf-8"))
    data.update(
        {
            "OLLAMA_MODE": "remote",
            "EXOSITES_REMOTE_LLM": "1",
            "OLLAMA_HOST": host,
            "OLLAMA_API_KEY": token,
            "EXOSITES_SORT_CREDENTIALS_MANAGED": "1",
            "EXOSITES_LLM_MAX_SLOTS": str(
                creds.get("llm_max_slots")
                or creds.get("max_parallel_requests")
                or os.environ.get("SORT_LLM_MAX_PARALLEL")
                or 2
            ),
            "EXOSITES_SORT_MAX_CONCURRENCY": str(
                creds.get("sort_max_concurrency")
                or os.environ.get("SORT_CLOUD_SORT_CONCURRENCY")
                or 1
            ),
        }
    )
    queue_url = str(creds.get("queue_url") or "").strip()
    if os.environ.get("GA_LIVE_SORT_NO_QUEUE", "0").strip().lower() in ("1", "true", "yes"):
        queue_url = ""
    if queue_url:
        data["EXOSITES_SORT_QUEUE_URL"] = queue_url.rstrip("/")
    elif "EXOSITES_SORT_QUEUE_URL" in data:
        del data["EXOSITES_SORT_QUEUE_URL"]
    overrides_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(
        f"==> Fresh sort credentials applied ({host}, "
        f"slots={data['EXOSITES_LLM_MAX_SLOTS']}, "
        f"sort_concurrency={data['EXOSITES_SORT_MAX_CONCURRENCY']}"
        f"{', queue=on' if queue_url else ''})"
    )
    print(f"==> Overrides: {overrides_path}")
    print("==> Restart the backend if it was already running (credentials load at startup).")


def _token() -> str:
    tok = os.environ.get("EXOSITES_APP_TOKEN", "").strip()
    if tok:
        return tok
    if TOKEN_FILE.is_file():
        return TOKEN_FILE.read_text(encoding="utf-8").strip()
    if os.environ.get("EXOSITES_INSECURE_LOCAL", "").strip() in ("1", "true", "yes"):
        return ""
    raise SystemExit(
        "No app token — start `npm run dev` (writes .dev-app-token) or set EXOSITES_APP_TOKEN"
    )


def _request(method: str, path: str, body: dict | None = None) -> dict:
    headers = {"Accept": "application/json"}
    tok = _token()
    if tok:
        headers["X-App-Token"] = tok
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise SystemExit(f"{method} {path} HTTP {exc.code}: {detail}") from exc


def _materialize_fixtures(work: Path) -> list[str]:
    paths: list[str] = []
    for fp in sorted(FIXTURES.glob("*.json")):
        if fp.name.startswith("gold_labels"):
            continue
        case = json.loads(fp.read_text(encoding="utf-8"))
        text = str(case.get("text") or "").strip()
        if not text:
            continue
        name = str(case.get("source_filename") or f"{case.get('id', fp.stem)}.txt")
        name = f"{Path(name).stem}.txt"
        out = work / "input" / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
        paths.append(str(out))
    return paths


def _warn_backend_overrides() -> None:
    """Ensure desktop overrides exist and remind about EXOSITES_USER_DATA for bare uvicorn."""
    overrides = USER_DATA / "backend-env-overrides.json"
    if not overrides.is_file():
        print(f"WARN: missing {overrides} — run with GA_LIVE_SORT_CREDENTIALS_ONLY=1 first")
        return
    try:
        data = json.loads(overrides.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"WARN: invalid JSON in {overrides}")
        return
    if data.get("OLLAMA_MODE") != "remote":
        print("WARN: OLLAMA_MODE is not remote in overrides — cloud sort may not run on VPS")
    if data.get("EXOSITES_SORT_QUEUE_URL"):
        print("NOTE: EXOSITES_SORT_QUEUE_URL set — batch may be slower under queue routing")
    elif os.environ.get("EXOSITES_USER_DATA", "").strip() in ("", str(USER_DATA)):
        if not os.environ.get("EXOSITES_USER_DATA"):
            print(
                f"NOTE: backend must load overrides from {USER_DATA}\n"
                "      Start via `npm run dev` or set EXOSITES_USER_DATA before uvicorn"
            )


def main() -> int:
    creds_only = os.environ.get("GA_LIVE_SORT_CREDENTIALS_ONLY", "0").strip().lower() in ("1", "true", "yes")
    skip_creds = os.environ.get("GA_LIVE_SORT_SKIP_CREDENTIALS", "0").strip().lower() in ("1", "true", "yes")

    if creds_only:
        _ensure_fresh_sort_credentials()
        return 0

    if not skip_creds:
        _ensure_fresh_sort_credentials()

    _warn_backend_overrides()

    health = _request("GET", "/health")
    if health.get("status") != "ok" and not health.get("ok"):
        print("Backend health unexpected:", health)
        return 1

    work = ROOT / ".ga-sort-smoke" / "run"
    if work.exists():
        import shutil
        shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    files = _materialize_fixtures(work)
    if len(files) < 10:
        print(f"Expected >=10 fixture files, got {len(files)}")
        return 1

    out_dir = work / "output"
    out_dir.mkdir()
    for folder in (
        "Invoices",
        "Bank Statements",
        "Contracts",
        "HR Documents",
        "Medical",
        "Taxes",
        "Uncertain",
    ):
        (out_dir / folder).mkdir(exist_ok=True)

    started = _request(
        "POST",
        "/analyze",
        {
            "file_paths": files,
            "output_dir": str(out_dir),
            "model": "mistral",
            "mode": "copy",
            "language": "English",
            "dry_run": True,
        },
    )
    job_id = str(started.get("job_id") or started.get("id") or "")
    if not job_id:
        print("No job_id in response:", started)
        return 1

    print(f"==> Job {job_id} — {len(files)} files via cloud mistral (dry run)")
    deadline = time.time() + TIMEOUT_S
    last_phase = ""
    while time.time() < deadline:
        job = _request("GET", f"/job/{job_id}")
        phase = str(job.get("phase") or job.get("status") or "")
        if phase != last_phase:
            print(f"    phase: {phase}")
            last_phase = phase
        if phase in {"awaiting_approval", "done", "completed"}:
            break
        if phase in {"failed", "error", "cancelled"}:
            print("Job failed:", job.get("error"))
            return 1
        time.sleep(2)
    else:
        print(f"Timed out after {TIMEOUT_S}s")
        return 1

    rows = job.get("files") or []
    ok = 0
    uncertain = 0
    errors = 0
    for row in rows:
        folder = str(row.get("suggested_folder") or row.get("final_folder") or "").strip()
        if row.get("error"):
            errors += 1
        elif folder.lower() == "uncertain" or not folder:
            uncertain += 1
        else:
            ok += 1

    print(f"==> Classified: {ok}/{len(rows)} with folder, {uncertain} uncertain, {errors} errors")
    for row in rows[:5]:
        print(
            f"    {Path(str(row.get('name') or row.get('path') or '')).name}"
            f" -> {row.get('suggested_folder') or row.get('final_folder') or '?'}"
        )
    if len(rows) > 5:
        print(f"    … and {len(rows) - 5} more")

    if ok >= MIN_OK:
        print("OK: live cloud sort smoke passed")
        return 0
    print(f"FAIL: need >={MIN_OK} classified files")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
