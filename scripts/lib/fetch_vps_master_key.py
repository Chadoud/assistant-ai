#!/usr/bin/env python3
"""Fetch LITELLM_MASTER_KEY from VPS .env for GA scripts when local .env missing."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path


def fetch_vps_master_key() -> str:
    key_path = os.environ.get("VPS_SSH_KEY", "").strip()
    if not key_path or not Path(key_path).is_file():
        return ""
    ssh = os.environ.get("VPS_SSH", "").strip()
    if not ssh:
        return ""
    proc = subprocess.run(
        [
            "ssh",
            "-i",
            key_path,
            "-o",
            "StrictHostKeyChecking=accept-new",
            ssh,
            "grep '^LITELLM_MASTER_KEY=' ~/exo-llm/.env | cut -d= -f2-",
        ],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip().strip('"').strip("'")


if __name__ == "__main__":
    val = fetch_vps_master_key()
    print("ok" if val else "missing")
