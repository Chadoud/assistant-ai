"""Ground-truth npm dependency reconciliation for generated projects.

The model declares dependencies up front (in the plan) but generates code in
separate batches that can freely introduce new bare imports. This module makes
`package.json` follow the code: scan every source file for bare import
specifiers, diff them against the declared dependencies, and merge the missing
ones in — before the first `npm install` runs, so the classic
"imported `uuid` but never declared it" build failure cannot happen.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from codegen.error_taxonomy import package_name_from_specifier

logger = logging.getLogger(__name__)

_SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"}
_MAX_FILE_BYTES = 512 * 1024

# Bare (non-relative) specifiers in static/dynamic imports and requires.
_BARE_SPEC_PATTERNS = (
    re.compile(r"""\bfrom\s*['"]([^'"./][^'"]*)['"]"""),
    re.compile(r"""\bimport\s*['"]([^'"./][^'"]*)['"]"""),
    re.compile(r"""\brequire\(\s*['"]([^'"./][^'"]*)['"]\s*\)"""),
    re.compile(r"""\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)"""),
)

# Packages provided by the scaffold toolchain that never need declaring again.
_TOOLCHAIN_PACKAGES = frozenset({"vite", "typescript"})

DEFAULT_VERSION = "latest"

# Pinned versions for packages the model commonly reaches for, chosen to be
# compatible with the Vite 5 / React 18 / Tailwind 3 scaffold. Anything not
# listed falls back to "latest".
KNOWN_PACKAGE_VERSIONS: dict[str, str] = {
    "@emotion/react": "^11.11.4",
    "@emotion/styled": "^11.11.5",
    "@headlessui/react": "^2.0.4",
    "@heroicons/react": "^2.1.3",
    "@react-three/drei": "^9.106.0",
    "@react-three/fiber": "^8.16.8",
    "@tanstack/react-query": "^5.40.0",
    "animejs": "^3.2.2",
    "axios": "^1.7.2",
    "canvas-confetti": "^1.9.3",
    "chart.js": "^4.4.3",
    "classnames": "^2.5.1",
    "clsx": "^2.1.1",
    "date-fns": "^3.6.0",
    "dayjs": "^1.11.11",
    "dompurify": "^3.1.5",
    "framer-motion": "^11.2.0",
    "gsap": "^3.12.5",
    "howler": "^2.2.4",
    "idb": "^8.0.0",
    "immer": "^10.1.1",
    "localforage": "^1.10.0",
    "lodash": "^4.17.21",
    "lucide-react": "^0.395.0",
    "marked": "^12.0.2",
    "moment": "^2.30.1",
    "nanoid": "^5.0.7",
    "ramda": "^0.30.1",
    "react-beautiful-dnd": "^13.1.1",
    "react-chartjs-2": "^5.2.0",
    "react-dnd": "^16.0.1",
    "react-dnd-html5-backend": "^16.0.1",
    "react-hook-form": "^7.51.5",
    "react-icons": "^5.2.1",
    "react-markdown": "^9.0.1",
    "react-router-dom": "^6.23.1",
    "recharts": "^2.12.7",
    "socket.io-client": "^4.7.5",
    "styled-components": "^6.1.11",
    "three": "^0.165.0",
    "uuid": "^9.0.1",
    "zod": "^3.23.8",
    "zustand": "^4.5.2",
}


def version_for_package(name: str) -> str:
    return KNOWN_PACKAGE_VERSIONS.get(name, DEFAULT_VERSION)


def _iter_bare_specifiers(text: str) -> set[str]:
    found: set[str] = set()
    for pattern in _BARE_SPEC_PATTERNS:
        found.update(match.group(1) for match in pattern.finditer(text))
    return found


def find_bare_imports(project_path: str | Path) -> set[str]:
    """Package names imported by source files under `project_path`."""
    root = Path(project_path).expanduser().resolve()
    if not root.is_dir():
        return set()
    packages: set[str] = set()
    for path in root.rglob("*"):
        if "node_modules" in path.parts or path.suffix not in _SOURCE_SUFFIXES:
            continue
        if not path.is_file() or path.stat().st_size > _MAX_FILE_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for spec in _iter_bare_specifiers(text):
            name = package_name_from_specifier(spec)
            if name and name not in _TOOLCHAIN_PACKAGES:
                packages.add(name)
    return packages


def _read_package_json(project_path: str | Path) -> dict | None:
    pkg_path = Path(project_path).expanduser().resolve() / "package.json"
    if not pkg_path.is_file():
        return None
    try:
        payload = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.info("[codegen] reconciler could not read package.json: %s", exc)
        return None
    return payload if isinstance(payload, dict) else None


def declared_dependencies(project_path: str | Path) -> set[str]:
    pkg = _read_package_json(project_path)
    if not pkg:
        return set()
    declared: set[str] = set()
    for key in ("dependencies", "devDependencies", "peerDependencies"):
        section = pkg.get(key)
        if isinstance(section, dict):
            declared.update(str(name) for name in section)
    return declared


def missing_dependencies(project_path: str | Path) -> dict[str, str]:
    """
    Packages imported by the code but absent from package.json.

    @return: {package: version} additions; empty when package.json is missing
             (static projects) or everything is declared.
    """
    if _read_package_json(project_path) is None:
        return {}
    declared = declared_dependencies(project_path)
    imported = find_bare_imports(project_path)
    return {name: version_for_package(name) for name in sorted(imported - declared)}


def merged_package_json_text(
    project_path: str | Path,
    additions: dict[str, str],
    *,
    overwrite_versions: bool = False,
) -> str | None:
    """
    Current on-disk package.json with `additions` merged into dependencies.

    @param overwrite_versions: replace versions of already-declared packages
           (used to strip hallucinated versions after a registry 404).
    @return: rendered JSON text, or None when package.json is missing/invalid.
    """
    pkg = _read_package_json(project_path)
    if pkg is None or not additions:
        return None
    deps = pkg.get("dependencies")
    if not isinstance(deps, dict):
        deps = {}
    dev_deps = pkg.get("devDependencies") if isinstance(pkg.get("devDependencies"), dict) else {}
    changed = False
    for name, version in additions.items():
        if overwrite_versions:
            if name in deps and deps[name] != version:
                deps[name] = version
                changed = True
            if name in dev_deps and dev_deps[name] != version:
                dev_deps[name] = version
                changed = True
            continue
        if name not in deps and name not in dev_deps:
            deps[name] = version
            changed = True
    if not changed:
        return None
    pkg["dependencies"] = dict(sorted(deps.items()))
    return json.dumps(pkg, indent=2) + "\n"
