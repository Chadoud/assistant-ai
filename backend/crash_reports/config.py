"""Load crash-ingest settings from environment (never from the frontend).

Crash reports are forwarded to the central account API (api.exosites.ch), which is
the single server-side owner of database credentials. The desktop backend only needs
the public ingest URL and a write-only shared token.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_TIMEOUT_SECONDS = 15.0


@dataclass(frozen=True)
class CrashIngestConfig:
    url: str
    token: str
    verify_ssl: bool
    timeout_seconds: float


def crash_ingest_config() -> CrashIngestConfig | None:
    """
    Returns config when both URL and token are set.

    Variables::

        EXOSITES_CRASH_INGEST_URL    e.g. https://api.exosites.ch/v1/crash-reports
        EXOSITES_CRASH_INGEST_TOKEN  shared secret sent as X-Crash-Token
        EXOSITES_CRASH_INGEST_SSL    verify TLS (default 1; set 0 only for local dev)
        EXOSITES_CRASH_INGEST_TIMEOUT seconds (default 15)
    """
    url = os.environ.get("EXOSITES_CRASH_INGEST_URL", "").strip()
    token = os.environ.get("EXOSITES_CRASH_INGEST_TOKEN", "").strip()
    if not url or not token:
        return None

    ssl_raw = os.environ.get("EXOSITES_CRASH_INGEST_SSL", "1").strip().lower()
    verify_ssl = ssl_raw not in ("0", "false", "no", "off")

    timeout_raw = os.environ.get("EXOSITES_CRASH_INGEST_TIMEOUT", "").strip()
    try:
        timeout_seconds = float(timeout_raw) if timeout_raw else DEFAULT_TIMEOUT_SECONDS
    except ValueError:
        timeout_seconds = DEFAULT_TIMEOUT_SECONDS

    return CrashIngestConfig(
        url=url,
        token=token,
        verify_ssl=verify_ssl,
        timeout_seconds=timeout_seconds,
    )


def crash_reports_ingest_enabled() -> bool:
    return crash_ingest_config() is not None
