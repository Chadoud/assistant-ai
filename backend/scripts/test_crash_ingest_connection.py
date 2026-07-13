"""
Verify the crash-ingest API configuration from backend .env.

Crash reports are forwarded to the central account API (api.exosites.ch) rather than
written to MySQL directly. This loads the same dotenv paths as ``main.py``, then checks
that the ingest URL/token are set and the endpoint is reachable. Does not print secrets.

Usage (from repo root)::

    python backend/scripts/test_crash_ingest_connection.py        # config + reachability
    python backend/scripts/test_crash_ingest_connection.py --send  # also send a test crash
"""

from __future__ import annotations

import asyncio
import pathlib
import sys
from urllib.parse import urlsplit, urlunsplit


def _backend_main_py() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    backend_root = here.parent.parent
    return backend_root / "main.py"


def _health_url(ingest_url: str) -> str:
    parts = urlsplit(ingest_url)
    return urlunsplit((parts.scheme, parts.netloc, "/health", "", ""))


async def _run(send_test: bool) -> int:
    backend_root = _backend_main_py().parent
    sys.path.insert(0, str(backend_root))

    from dotenv_bootstrap import load_dotenv_early

    load_dotenv_early(main_file=str(_backend_main_py()))

    import httpx

    from crash_reports.config import crash_ingest_config

    conf = crash_ingest_config()
    if conf is None:
        print(
            "Not configured: set EXOSITES_CRASH_INGEST_URL and EXOSITES_CRASH_INGEST_TOKEN "
            "in backend/.env — see backend/.env.example."
        )
        return 1

    print(f"Ingest URL: {conf.url} (verify_ssl={conf.verify_ssl}, timeout={conf.timeout_seconds}s)")

    async with httpx.AsyncClient(timeout=conf.timeout_seconds, verify=conf.verify_ssl) as client:
        try:
            health = await client.get(_health_url(conf.url))
            print(f"GET /health → {health.status_code} {health.text[:120]!r}")
        except httpx.HTTPError as exc:
            print(f"Health check failed: {exc}")
            print(
                "Hints: confirm EXOSITES_CRASH_INGEST_URL; check internet/DNS; confirm the "
                "Node app at api.exosites.ch is running."
            )
            return 1

        if send_test:
            payload = {
                "app_version": "verify",
                "environment": "script",
                "ui_locale": "en",
                "platform": "script",
                "source": "script",
                "instance_id": "verify-crash-ingest-selftest",
                "error_message": "Automated verify — connectivity self-test (excluded from dashboards)",
                "stack_trace": None,
            }
            print(
                "WARNING: --send writes a verify/script row excluded from DataSuite crash KPIs."
            )
            try:
                resp = await client.post(
                    conf.url, json=payload, headers={"X-Crash-Token": conf.token}
                )
                print(f"POST crash → {resp.status_code} {resp.text[:120]!r}")
                if resp.status_code != 200:
                    return 1
            except httpx.HTTPError as exc:
                print(f"Send failed: {exc}")
                return 1

    print("OK — ingest API reachable.")
    return 0


def main() -> None:
    send_test = "--send" in sys.argv[1:]
    raise SystemExit(asyncio.run(_run(send_test)))


if __name__ == "__main__":
    main()
