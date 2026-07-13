"""Static detection of broken local imports in a generated project.

A common generation failure is emitting `import App from "./App"` while never
writing `App.tsx`. The dev server still answers HTTP 200 (Vite shows an error
overlay), so the only reliable signal is checking the import graph on disk.

This module resolves *relative* import specifiers against the files actually
written and reports the ones that point nowhere — cheap, deterministic, and
runs before the dev server starts.
"""

from __future__ import annotations

import re
from pathlib import Path

# Source files whose import graph we validate.
_SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"}

# Extensions tried when a specifier omits one (mirrors a bundler's resolver).
_RESOLVE_SUFFIXES = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
                     ".css", ".scss", ".sass", ".less", ".svg", ".vue", ".svelte")

# `from "./x"`, side-effect `import "./x.css"`, `require("./x")`, dynamic `import("./x")`.
_SPEC_PATTERNS = (
    re.compile(r"""\bfrom\s*['"](\.[^'"]+)['"]"""),
    re.compile(r"""\bimport\s*['"](\.[^'"]+)['"]"""),
    re.compile(r"""\brequire\(\s*['"](\.[^'"]+)['"]\s*\)"""),
    re.compile(r"""\bimport\(\s*['"](\.[^'"]+)['"]\s*\)"""),
)

_MAX_FILE_BYTES = 512 * 1024


class MissingImport:
    """A relative import that does not resolve to a written file."""

    __slots__ = ("source", "specifier")

    def __init__(self, source: str, specifier: str) -> None:
        self.source = source
        self.specifier = specifier

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"MissingImport(source={self.source!r}, specifier={self.specifier!r})"


def _iter_specifiers(text: str) -> set[str]:
    found: set[str] = set()
    for pattern in _SPEC_PATTERNS:
        found.update(match.group(1) for match in pattern.finditer(text))
    return found


def _resolves(root: Path, importing_file: Path, specifier: str) -> bool:
    """True when `specifier` (relative to `importing_file`) maps to an on-disk file."""
    base = (importing_file.parent / specifier).resolve()

    # Outside the project (e.g. a path escaping into node deps) — not ours to repair.
    try:
        base.relative_to(root)
    except ValueError:
        return True

    for suffix in _RESOLVE_SUFFIXES:
        direct = base if suffix == "" else base.with_name(base.name + suffix)
        if direct.is_file():
            return True
        index_file = base / "index" if suffix == "" else base / f"index{suffix}"
        if index_file.is_file():
            return True
    return False


def find_unresolved_local_imports(project_path: str) -> list[MissingImport]:
    """
    Scan every source file under `project_path` and return the relative imports
    that do not resolve to a written file.

    @param project_path: absolute project root.
    @return: list of unresolved imports (deduplicated by specifier per source).
    """
    root = Path(project_path).expanduser().resolve()
    if not root.is_dir():
        return []

    missing: list[MissingImport] = []
    seen: set[tuple[str, str]] = set()
    for path in root.rglob("*"):
        if "node_modules" in path.parts or path.suffix not in _SOURCE_SUFFIXES:
            continue
        if not path.is_file() or path.stat().st_size > _MAX_FILE_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = path.relative_to(root).as_posix()
        for specifier in _iter_specifiers(text):
            if _resolves(root, path, specifier):
                continue
            key = (rel, specifier)
            if key in seen:
                continue
            seen.add(key)
            missing.append(MissingImport(rel, specifier))
    return missing


def describe_missing_imports(missing: list[MissingImport]) -> str:
    """Human/LLM-readable summary used as a repair hint."""
    lines = [f'- "{m.specifier}" imported by {m.source} does not exist' for m in missing]
    return "Unresolved local imports (the referenced files are missing):\n" + "\n".join(lines)
