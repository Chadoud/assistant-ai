"""Scan and manage Ollama local blob cache (incomplete `*-partial*` downloads).

Ollama stores data under ``~/.ollama`` (``models/blobs``, ``models/manifests``).
This module only touches files under ``models/blobs`` whose names indicate
partial layer downloads.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

PARTIAL_MARKER = "-partial"
# Full blob name: sha256-<64 hex chars>[-partial...]
DIGEST_PREFIX_RE = re.compile(r"^sha256-[0-9a-f]{64}$")


def ollama_home() -> Path:
    return Path.home() / ".ollama"


def blobs_dir() -> Path:
    return ollama_home() / "models" / "blobs"


def manifests_dir() -> Path:
    return ollama_home() / "models" / "manifests"


def _blob_stem_from_manifest_digest(digest: str) -> str | None:
    """Manifest digests use ``sha256:<hex>``; blob filenames use ``sha256-<hex>``."""
    s = (digest or "").strip()
    if s.startswith("sha256:"):
        rest = s[7:].lower()
        if len(rest) == 64 and all(c in "0123456789abcdef" for c in rest):
            return f"sha256-{rest}"
    if s.startswith("sha256-") and len(s) == 7 + 64:
        hx = s[7:].lower()
        if all(c in "0123456789abcdef" for c in hx):
            return s[:7] + hx
    return None


def build_digest_to_model_refs(manifests_root: Path | None = None) -> dict[str, set[str]]:
    """Map blob digest stem (``sha256-`` + 64 hex) to model refs (e.g. ``mistral:latest``, ``llava:7b``)."""
    root = (manifests_root or manifests_dir()).resolve()
    out: dict[str, set[str]] = {}
    lib = root / "registry.ollama.ai" / "library"
    if not lib.is_dir():
        return out

    for manifest_path in lib.rglob("*"):
        if not manifest_path.is_file():
            continue
        try:
            rel = manifest_path.relative_to(lib)
        except ValueError:
            continue
        parts = rel.parts
        if len(parts) < 2:
            continue
        model_ref = f"{parts[-2]}:{parts[-1]}"
        try:
            raw = manifest_path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        digests: list[str] = []
        cfg = data.get("config")
        if isinstance(cfg, dict) and isinstance(cfg.get("digest"), str):
            digests.append(cfg["digest"])
        layers = data.get("layers")
        if isinstance(layers, list):
            for layer in layers:
                if isinstance(layer, dict) and isinstance(layer.get("digest"), str):
                    digests.append(layer["digest"])
        for d in digests:
            stem = _blob_stem_from_manifest_digest(d)
            if stem is None:
                continue
            out.setdefault(stem, set()).add(model_ref)

    return out


def enrich_partial_groups(groups: list[dict]) -> list[dict]:
    """Attach ``related_models`` (from local manifests) to each partial blob group."""
    dmap = build_digest_to_model_refs()
    enriched: list[dict] = []
    for g in groups:
        stem = (g.get("digest_prefix") or "").strip()
        related = sorted(dmap.get(stem, set())) if stem else []
        enriched.append({**g, "related_models": related})
    return enriched


def validate_digest_prefix(digest_prefix: str) -> bool:
    s = (digest_prefix or "").strip()
    return bool(DIGEST_PREFIX_RE.match(s))


def partial_group_stem(filename: str) -> str | None:
    """Return canonical digest prefix for a blob filename, or None if not a partial blob."""
    if PARTIAL_MARKER not in filename:
        return None
    stem = re.sub(r"-partial.*$", "", filename)
    if not stem.startswith("sha256-"):
        return None
    if not DIGEST_PREFIX_RE.match(stem):
        return None
    return stem


def scan_partial_groups(blobs_path: Path | None = None) -> list[dict]:
    """List grouped partial download files under ``blobs/`` (largest first)."""
    root = (blobs_path or blobs_dir()).resolve()
    if not root.is_dir():
        return []

    groups: dict[str, dict] = {}
    for f in root.iterdir():
        if not f.is_file():
            continue
        stem = partial_group_stem(f.name)
        if stem is None:
            continue
        try:
            sz = f.stat().st_size
        except OSError:
            continue
        if stem not in groups:
            groups[stem] = {
                "group_id": stem,
                "digest_prefix": stem,
                "total_bytes": 0,
                "file_count": 0,
            }
        groups[stem]["total_bytes"] += sz
        groups[stem]["file_count"] += 1

    out = sorted(groups.values(), key=lambda x: -x["total_bytes"])
    return out


def delete_partial_group(blobs_path: Path, digest_prefix: str) -> tuple[int, int]:
    """Delete all blob files for one partial group. Returns (files_removed, bytes_freed)."""
    if not validate_digest_prefix(digest_prefix):
        raise ValueError("Invalid digest prefix")

    root = blobs_path.resolve()
    if not root.is_dir():
        raise ValueError("Blobs directory does not exist")

    prefix = digest_prefix.strip()
    needle = prefix + "-partial"
    removed = 0
    freed = 0

    for f in root.iterdir():
        if not f.is_file():
            continue
        name = f.name
        if not name.startswith(needle):
            continue
        try:
            st = f.stat().st_size
            f.unlink()
            removed += 1
            freed += st
        except OSError:
            continue

    return removed, freed


def _subprocess_no_window_kw() -> dict:
    if sys.platform == "win32":
        # Avoid flashing a console on Windows
        return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}
    return {}


def ollama_prune_cli_available() -> bool:
    """True if ``ollama prune`` exists (CLI supports the subcommand)."""
    import shutil

    if not shutil.which("ollama"):
        return False
    kw = _subprocess_no_window_kw()
    try:
        r = subprocess.run(
            ["ollama", "prune", "--help"],
            capture_output=True,
            text=True,
            timeout=8,
            **kw,
        )
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def run_ollama_prune() -> tuple[bool, str]:
    """Run ``ollama prune`` non-interactively when possible. Returns (ok, message)."""
    import shutil

    if not shutil.which("ollama"):
        return False, "ollama not found in PATH"
    if not ollama_prune_cli_available():
        return False, "This Ollama version has no `prune` command — upgrade Ollama to reclaim unused layers."

    kw = _subprocess_no_window_kw()
    attempts: list[tuple[list[str], str | None]] = [
        (["ollama", "prune", "-y"], None),
        (["ollama", "prune", "--force"], None),
        (["ollama", "prune"], "y\n"),
    ]
    last_err = ""
    for args, stdin in attempts:
        try:
            r = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=600,
                input=stdin,
                **kw,
            )
        except subprocess.TimeoutExpired:
            return False, "ollama prune timed out"
        except OSError as e:
            return False, str(e)

        combined = ((r.stderr or "") + "\n" + (r.stdout or "")).strip()
        last_err = combined
        if r.returncode == 0:
            return True, combined or "Prune completed."
        if "unknown" in combined.lower() and "prune" in combined.lower():
            continue

    return False, last_err or "ollama prune failed"
