"""Deterministic classification of build/install errors for the repair loop.

Most preview failures are machine-recognizable (a missing npm package, a
missing local file, a hallucinated package version). Classifying them first
lets the repair loop apply a deterministic fix without an LLM call, and gives
the LLM tier a precise hint when it is needed.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from enum import Enum

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")

# Node built-ins never map to an npm dependency.
NODE_BUILTIN_MODULES: frozenset[str] = frozenset(
    {
        "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
        "constants", "crypto", "dgram", "dns", "domain", "events", "fs", "http",
        "http2", "https", "inspector", "module", "net", "os", "path", "perf_hooks",
        "process", "punycode", "querystring", "readline", "repl", "stream",
        "string_decoder", "timers", "tls", "tty", "url", "util", "v8", "vm",
        "worker_threads", "zlib",
    }
)

_NPM_NAME_RE = re.compile(r"^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$")


class ErrorClass(str, Enum):
    missing_npm_package = "missing_npm_package"
    missing_local_file = "missing_local_file"
    install_registry_error = "install_registry_error"
    syntax_error = "syntax_error"
    css_tailwind = "css_tailwind"
    port_conflict = "port_conflict"
    unknown = "unknown"


@dataclass(frozen=True)
class ErrorDiagnosis:
    error_class: ErrorClass
    packages: tuple[str, ...] = ()
    fingerprint: str = ""


def package_name_from_specifier(specifier: str) -> str | None:
    """Map an import specifier to its npm package name (or None if not one)."""
    spec = specifier.strip().strip("'\"")
    if not spec or spec.startswith((".", "/", "~", "node:", "virtual:", "data:", "http:", "https:")):
        return None
    parts = spec.split("/")
    name = "/".join(parts[:2]) if spec.startswith("@") and len(parts) >= 2 else parts[0]
    if name in NODE_BUILTIN_MODULES or not _NPM_NAME_RE.match(name):
        return None
    return name


# Patterns that carry an import specifier (bare → missing package, relative → missing file).
_IMPORT_SPEC_PATTERNS = (
    re.compile(r"Failed to resolve import\s+['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"Cannot find module\s+['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"Can't resolve\s+['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"Could not resolve\s+['\"]([^'\"]+)['\"]", re.IGNORECASE),
    re.compile(r"Failed to resolve dependency:\s*([^\s,]+)", re.IGNORECASE),
)

# Vite optimizeDeps block: "The following dependencies are imported but could not
# be resolved:" followed by "  uuid (imported by /path/to/App.tsx)" lines.
_OPTIMIZE_DEPS_HEADER_RE = re.compile(
    r"dependencies are imported but could not be resolved", re.IGNORECASE
)
_OPTIMIZE_DEPS_ITEM_RE = re.compile(r"^\s*([@a-z0-9][^\s(]*)\s*\(imported by", re.IGNORECASE | re.MULTILINE)

_REGISTRY_ERROR_RE = re.compile(
    r"\bE404\b|\bETARGET\b|No matching version found for|is not in this registry|404 Not Found.*registry",
    re.IGNORECASE,
)
_REGISTRY_PACKAGE_PATTERNS = (
    re.compile(r"No matching version found for\s+((?:@[^\s@/]+/)?[^\s@]+)@", re.IGNORECASE),
    re.compile(r"404\s+(?:Not Found\s+)?-?\s*GET\s+https?://[^\s]*/((?:@[^\s@/]+%2[fF])?[^\s/@]+)\s", re.IGNORECASE),
    re.compile(r"'((?:@[^\s@/]+/)?[^\s@']+)@[^']*'\s+is not in this registry", re.IGNORECASE),
)

_PORT_CONFLICT_RE = re.compile(r"\bEADDRINUSE\b|address already in use|port .* is already in use", re.IGNORECASE)
_CSS_TAILWIND_RE = re.compile(r"\[postcss\]|tailwind|@apply|Unknown at rule", re.IGNORECASE)
_SYNTAX_RE = re.compile(
    r"Unexpected token|Transform failed|Parse (?:error|failure)|Unterminated (?:string|regexp)|"
    r"Unexpected end of file|Expected ['\"][};)\]]|SyntaxError",
    re.IGNORECASE,
)


def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text or "")


def _fingerprint(error_class: ErrorClass, packages: tuple[str, ...], text: str) -> str:
    if packages:
        basis = f"{error_class.value}:{','.join(sorted(packages))}"
    else:
        # Normalize volatile parts (numbers, whitespace) so the same error
        # produces the same fingerprint across runs.
        head = re.sub(r"\d+", "#", " ".join(text.split()))[:200].lower()
        basis = f"{error_class.value}:{head}"
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()[:12]


def _collect_import_specifiers(text: str) -> list[str]:
    specs: list[str] = []
    for pattern in _IMPORT_SPEC_PATTERNS:
        specs.extend(match.group(1) for match in pattern.finditer(text))
    if _OPTIMIZE_DEPS_HEADER_RE.search(text):
        specs.extend(match.group(1) for match in _OPTIMIZE_DEPS_ITEM_RE.finditer(text))
    return specs


def classify_error(error_text: str) -> ErrorDiagnosis:
    """
    Classify a build/dev-server/install error into an actionable class.

    @param error_text: raw error output (multi-line, may contain ANSI codes).
    @return: diagnosis with class, extracted package names, and a stable fingerprint.
    """
    text = strip_ansi(error_text or "")
    if not text.strip():
        return ErrorDiagnosis(ErrorClass.unknown, (), _fingerprint(ErrorClass.unknown, (), ""))

    if _REGISTRY_ERROR_RE.search(text):
        packages: list[str] = []
        for pattern in _REGISTRY_PACKAGE_PATTERNS:
            for match in pattern.finditer(text):
                name = package_name_from_specifier(match.group(1).replace("%2f", "/").replace("%2F", "/"))
                if name:
                    packages.append(name)
        pkg_tuple = tuple(dict.fromkeys(packages))
        return ErrorDiagnosis(
            ErrorClass.install_registry_error,
            pkg_tuple,
            _fingerprint(ErrorClass.install_registry_error, pkg_tuple, text),
        )

    specs = _collect_import_specifiers(text)
    if specs:
        bare = tuple(dict.fromkeys(n for n in (package_name_from_specifier(s) for s in specs) if n))
        if bare:
            return ErrorDiagnosis(
                ErrorClass.missing_npm_package,
                bare,
                _fingerprint(ErrorClass.missing_npm_package, bare, text),
            )
        if any(s.strip().strip("'\"").startswith((".", "/")) for s in specs):
            return ErrorDiagnosis(
                ErrorClass.missing_local_file,
                (),
                _fingerprint(ErrorClass.missing_local_file, (), text),
            )

    if _PORT_CONFLICT_RE.search(text):
        return ErrorDiagnosis(ErrorClass.port_conflict, (), _fingerprint(ErrorClass.port_conflict, (), text))
    if _SYNTAX_RE.search(text):
        return ErrorDiagnosis(ErrorClass.syntax_error, (), _fingerprint(ErrorClass.syntax_error, (), text))
    if _CSS_TAILWIND_RE.search(text):
        return ErrorDiagnosis(ErrorClass.css_tailwind, (), _fingerprint(ErrorClass.css_tailwind, (), text))

    return ErrorDiagnosis(ErrorClass.unknown, (), _fingerprint(ErrorClass.unknown, (), text))
