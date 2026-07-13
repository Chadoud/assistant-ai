"""Decide whether install/dev restart can be skipped on follow-up patches."""

from __future__ import annotations

from pathlib import Path

DEPENDENCY_MANIFEST_NAMES = frozenset(
    {
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
    }
)


def _basename(rel_path: str) -> str:
    return Path(rel_path.replace("\\", "/")).name.lower()


def dependency_manifests_touched(written_paths: list[str]) -> bool:
    """True when any lockfile or package.json was written in this batch."""
    return any(_basename(p) in DEPENDENCY_MANIFEST_NAMES for p in written_paths)


def should_skip_install(project_path: str | Path, written_paths: list[str], *, is_follow_up: bool) -> bool:
    """
    Skip npm install when node_modules exists and dependency manifests were not changed.

    Fresh builds always install; follow-up style edits can hot-reload without reinstall.
    """
    if not is_follow_up:
        return False
    root = Path(project_path).expanduser().resolve()
    if not (root / "node_modules").is_dir():
        return False
    return not dependency_manifests_touched(written_paths)


def stack_requires_install(project_path: str | Path, install_command: str | None) -> bool:
    """False for static HTML projects and other stacks with no install step."""
    if not install_command or not str(install_command).strip():
        return False
    root = Path(project_path).expanduser().resolve()
    return (root / "package.json").is_file()


def should_reuse_dev_server(written_paths: list[str], *, is_follow_up: bool) -> bool:
    """Reuse a healthy dev server when follow-up only touched source files."""
    if not is_follow_up:
        return False
    return not dependency_manifests_touched(written_paths)
