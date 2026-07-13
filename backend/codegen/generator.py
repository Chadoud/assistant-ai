"""LLM-driven multi-file project generation for Codegen Studio."""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from typing import Any

from codegen.json_salvage import salvage_file_entries, salvage_paths_list
from orchestrator import Capability
from orchestrator.complete import CompletionError, complete

logger = logging.getLogger(__name__)

OnRelay = Callable[[str, str, str], None]

_MAX_SINGLE_ATTEMPTS = 2
_BATCH_SIZE = 4
_ESSENTIAL_PATHS = (
    "package.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.app.json",
    "src/main.tsx",
    "src/App.tsx",
    "src/index.css",
)

_SYSTEM = """\
You are a senior full-stack engineer building runnable web projects.

Output ONLY valid JSON (no markdown fences) with this shape:
{
  "files": [
    { "path": "relative/path/from/project/root", "content": "full file contents" }
  ]
}

Rules:
- Include ALL files needed to run: package.json with dev script, configs, source files, index.html if needed.
- When the user mentions React, TypeScript, Tailwind, Vite, or npm install / npm run dev, you MUST output a Vite+React project with package.json — never plain HTML/CSS/JS only.
- Use plain static HTML only when the user explicitly asks for a static page with no npm/build step.
- Use the stack the user requested (React/Vite/Tailwind, Next.js, Vue, static HTML, etc.).
- Every file must have complete content — no placeholders, no TODO, no "..." omissions.
- Paths use forward slashes. No absolute paths. No path traversal (..).
- package.json must include working scripts (prefer "dev" for Vite/Next).
- Escape newlines and quotes inside JSON strings properly.
- If the project is large, return at most 8 files in this response — essential runnable set only.
"""

_MANIFEST_SYSTEM = """\
You plan a minimal runnable web project. Output ONLY valid JSON (no markdown):
{"paths": ["package.json", "index.html", "src/App.tsx", ...]}

Rules:
- 8 to 14 relative paths, forward slashes, no ..
- Include package.json with dev script when the user wants React/Vite/npm.
- No file contents — paths only.
"""

_PLAN_SYSTEM = """\
You plan how to build a web app on a PRE-EXISTING Vite + React + TypeScript + Tailwind scaffold.
The scaffold already provides package.json, vite.config.ts, tsconfig, index.html, src/main.tsx,
src/index.css (with Tailwind directives) and src/App.tsx. You will NOT recreate those.

Output ONLY valid JSON (no markdown fences):
{
  "stack": "Vite + React + TS + Tailwind",
  "steps": [
    { "title": "Short human step the user will see", "kind": "generate" }
  ],
  "app_files": ["src/App.tsx", "src/components/Feed.tsx", "src/index.css"],
  "dependencies": { "package-name": "^1.2.3" }
}

Rules:
- 4 to 7 steps describing the journey in plain language (e.g. "Build the feed UI", "Wire up state", "Style it").
- Each step "kind" MUST be one of: scaffold, generate, install, start, verify, preview, fix.
- Always include exactly one "install", one "start", one "verify", and one "preview" step (in that order, at the end). The build/generation steps come first with kind "generate".
- "app_files": the app source files YOU will write (under src/, forward slashes, no ..). Always include "src/App.tsx". Do NOT list package.json, vite.config, tsconfig, index.html, or src/main.tsx.
- "dependencies": only EXTRA npm packages beyond react/react-dom (leave {} if none). Never include react, react-dom, vite, tailwindcss, typescript.
"""

_BATCH_SYSTEM = """\
You generate file contents for a codegen studio batch. Output ONLY valid JSON:
{"files": [{"path": "relative/path", "content": "full file contents"}]}

Rules:
- Generate ONLY the paths listed in the user message.
- Complete file contents — no placeholders.
- Properly escaped JSON strings.
- Match the stack in the user's goal.
"""

_APP_BATCH_SYSTEM = """\
You generate app source files for an EXISTING Vite + React + TypeScript + Tailwind project.
The scaffold (package.json, vite.config.ts, tsconfig, index.html, src/main.tsx) already exists;
src/main.tsx renders <App/> from src/App.tsx. Do NOT recreate scaffold files.

Output ONLY valid JSON (no markdown): {"files": [{"path": "relative/path", "content": "full file contents"}]}

Rules:
- Generate ONLY the paths listed in the user message, with COMPLETE contents — no placeholders, no TODO, no "...".
- React function components + TypeScript. Style with Tailwind utility classes.
- src/App.tsx MUST `export default` the root component.
- If you emit src/index.css, keep the "@tailwind base; @tailwind components; @tailwind utilities;" directives at the top.
- Relative paths, forward slashes, no "..". Escape newlines and quotes inside JSON strings.
"""

_REPAIR_SYSTEM = """\
You fix incomplete codegen JSON. Output ONLY valid JSON: { "files": [ { "path", "content" } ] }.
Return valid, complete JSON. Escape special characters in strings. No markdown fences.
"""

_FIX_SYSTEM = """\
You are a senior engineer fixing a broken web project. The dev server / build reported an error.

Output ONLY valid JSON (no markdown fences): {"files": [{"path": "relative/path", "content": "full corrected file"}]}

Rules:
- Return ONLY the files you must create or replace to fix the error — with COMPLETE contents, no placeholders.
- If an import points to a missing file, CREATE that file with complete, sensible content that matches the project.
- Do not touch unrelated files. Keep the existing stack, framework, and code style.
- The scaffold pins Vite ^5, React ^18, TypeScript ^5 and Tailwind CSS ^3 — write code compatible
  with those versions (Tailwind 3 "@tailwind" directives, not Tailwind 4 syntax).
- Relative paths, forward slashes. Never use ".." or absolute paths.
- Escape newlines and quotes inside JSON strings properly.
"""

# Per-error-class guidance appended to the repair prompt so the model attacks
# the diagnosed cause instead of guessing from the raw log.
_FIX_CLASS_HINTS: dict[str, str] = {
    "missing_npm_package": (
        "Diagnosis: an npm package is imported but not installed. Either add it to "
        "package.json dependencies or rewrite the code to not need it."
    ),
    "missing_local_file": (
        "Diagnosis: an import points to a project file that was never created. "
        "Create that file with complete, working content."
    ),
    "syntax_error": (
        "Diagnosis: a source file has a syntax error. Return the corrected file in full."
    ),
    "css_tailwind": (
        "Diagnosis: the CSS/Tailwind/PostCSS setup is broken. Keep the Tailwind 3 "
        "directives (@tailwind base/components/utilities) at the top of src/index.css."
    ),
    "install_registry_error": (
        "Diagnosis: npm install failed because a requested package version does not exist. "
        "Use a real, published version in package.json or drop the package."
    ),
}

_FIX_CONTEXT_FILE_LIMIT = 18
_FIX_CONTEXT_FILE_CHARS = 2000
_FIX_CONTEXT_TOTAL_CHARS = 18000


def _extract_json_object(text: str) -> str:
    blob = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", blob)
    if fence:
        blob = fence.group(1).strip()
    start = blob.find("{")
    end = blob.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object in model response")
    return blob[start : end + 1]


def _normalize_files(payload: dict[str, Any]) -> list[dict[str, str]]:
    files = payload.get("files")
    if not isinstance(files, list):
        raise ValueError("Missing files array")
    out: list[dict[str, str]] = []
    for item in files:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path", "")).strip()
        content = item.get("content")
        if path and content is not None:
            out.append({"path": path, "content": str(content)})
    if not out:
        raise ValueError("No valid files in response")
    return out


def _parse_files_json(raw: str) -> list[dict[str, str]]:
    """Parse files JSON; salvage complete entries when the response was truncated."""
    try:
        payload = json.loads(_extract_json_object(raw))
        return _normalize_files(payload)
    except json.JSONDecodeError as exc:
        salvaged = salvage_file_entries(raw)
        if salvaged:
            logger.info("[codegen] salvaged %d complete files from truncated JSON", len(salvaged))
            return salvaged
        raise ValueError(str(exc)) from exc


def _parse_manifest_paths(raw: str) -> list[str]:
    try:
        payload = json.loads(_extract_json_object(raw))
        paths = payload.get("paths")
        if isinstance(paths, list):
            out = [str(p).strip() for p in paths if str(p).strip()]
            if out:
                return out
    except json.JSONDecodeError:
        pass
    salvaged = salvage_paths_list(raw)
    if salvaged:
        logger.info("[codegen] salvaged %d paths from truncated manifest", len(salvaged))
        return salvaged
    raise ValueError("Could not parse project manifest paths")


_VALID_STEP_KINDS = {"scaffold", "generate", "install", "start", "verify", "preview", "fix"}

_FALLBACK_PLAN = {
    "stack": "Vite + React + TS + Tailwind",
    "steps": [
        {"title": "Build the app", "kind": "generate"},
        {"title": "Install packages", "kind": "install"},
        {"title": "Start preview server", "kind": "start"},
        {"title": "Verify it renders", "kind": "verify"},
        {"title": "Live preview", "kind": "preview"},
    ],
    "app_files": ["src/App.tsx"],
    "dependencies": {},
}


def _normalize_plan(payload: dict[str, Any]) -> dict[str, Any]:
    raw_steps = payload.get("steps")
    steps: list[dict[str, str]] = []
    if isinstance(raw_steps, list):
        for item in raw_steps:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()[:80]
            kind = str(item.get("kind", "generate")).strip().lower()
            if kind not in _VALID_STEP_KINDS:
                kind = "generate"
            if title:
                steps.append({"title": title, "kind": kind})

    raw_files = payload.get("app_files")
    app_files: list[str] = []
    if isinstance(raw_files, list):
        for path in raw_files:
            rel = str(path).strip().replace("\\", "/").lstrip("/")
            if rel and ".." not in rel.split("/") and rel.startswith("src/"):
                app_files.append(rel)
    if "src/App.tsx" not in app_files:
        app_files.insert(0, "src/App.tsx")

    raw_deps = payload.get("dependencies")
    deps: dict[str, str] = {}
    if isinstance(raw_deps, dict):
        for name, version in raw_deps.items():
            if isinstance(name, str) and isinstance(version, str) and name.strip():
                deps[name.strip()] = version.strip()

    if not steps:
        steps = list(_FALLBACK_PLAN["steps"])
    return {
        "stack": str(payload.get("stack", "Vite + React + TS + Tailwind")).strip()[:60]
        or "Vite + React + TS + Tailwind",
        "steps": steps,
        "app_files": app_files[:24],
        "dependencies": deps,
    }


def plan_build(
    goal: str,
    *,
    provider: str | None = None,
    on_relay: OnRelay | None = None,
) -> dict[str, Any]:
    """
    Ask the model to author the build journey (steps), the app files it will
    write, and any extra dependencies — on top of the deterministic scaffold.

    Always returns a usable plan: falls back to a default journey on parse error.
    """
    try:
        raw = _complete_codegen(
            _PLAN_SYSTEM,
            goal,
            provider=provider,
            on_relay=on_relay,
            relay_kind="codegen_plan",
        )
        payload = json.loads(_extract_json_object(raw))
        return _normalize_plan(payload)
    except (CompletionError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("[codegen] plan_build failed (%s) — using fallback plan", exc)
        return {**_FALLBACK_PLAN, "steps": list(_FALLBACK_PLAN["steps"])}


def generate_app_files(
    goal: str,
    app_files: list[str],
    *,
    provider: str | None = None,
    on_relay: OnRelay | None = None,
) -> list[dict[str, str]]:
    """Generate ONLY the app source files (scaffold already on disk), batched."""
    paths = app_files or ["src/App.tsx"]
    files = _batch_generate(
        goal,
        paths,
        system=_APP_BATCH_SYSTEM,
        provider=provider,
        on_relay=on_relay,
        relay_kind="codegen_app",
    )
    if not files:
        raise ValueError("App file generation produced no files")
    return files


def _complete_codegen(
    system: str,
    user: str,
    *,
    provider: str | None,
    on_relay: OnRelay | None,
    relay_kind: str,
) -> str:
    return complete(
        Capability.REASONING,
        system,
        user,
        preferred=provider,
        on_relay=on_relay,
        relay_kind=relay_kind,
    )


def _dedupe_files(files: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for item in reversed(files):
        path = item["path"]
        if path in seen:
            continue
        seen.add(path)
        out.append(item)
    out.reverse()
    return out


def _batch_generate(
    goal: str,
    paths: list[str],
    *,
    system: str,
    provider: str | None,
    on_relay: OnRelay | None,
    relay_kind: str,
) -> list[dict[str, str]]:
    """Generate file contents in small batches — avoids output token truncation."""
    merged: list[dict[str, str]] = []
    for offset in range(0, len(paths), _BATCH_SIZE):
        batch = paths[offset : offset + _BATCH_SIZE]
        user = (
            f"User goal:\n{goal}\n\n"
            "Generate full contents for ONLY these paths:\n"
            + "\n".join(f"- {p}" for p in batch)
        )
        raw = _complete_codegen(system, user, provider=provider, on_relay=on_relay, relay_kind=relay_kind)
        try:
            merged.extend(_parse_files_json(raw))
        except ValueError as exc:
            logger.warning("[codegen] batch %s failed: %s — retrying batch", batch, exc)
            repair_user = (
                f"{user}\n\nPrevious JSON was invalid ({exc}). "
                "Return smaller valid JSON with only these files."
            )
            raw = _complete_codegen(
                _REPAIR_SYSTEM,
                repair_user,
                provider=provider,
                on_relay=on_relay,
                relay_kind=f"{relay_kind}_repair",
            )
            merged.extend(_parse_files_json(raw))
    return _dedupe_files(merged)


def _generate_via_batches(
    goal: str,
    *,
    provider: str | None = None,
    on_relay: OnRelay | None = None,
) -> list[dict[str, str]]:
    """Manifest + small content batches — avoids output token truncation."""
    manifest_raw = _complete_codegen(
        _MANIFEST_SYSTEM,
        goal,
        provider=provider,
        on_relay=on_relay,
        relay_kind="codegen_manifest",
    )
    paths = _parse_manifest_paths(manifest_raw)
    if "package.json" not in paths and any(
        kw in goal.lower() for kw in ("react", "vite", "typescript", "npm")
    ):
        paths = ["package.json", *paths]

    merged = _batch_generate(
        goal,
        paths,
        system=_BATCH_SYSTEM,
        provider=provider,
        on_relay=on_relay,
        relay_kind="codegen_batch",
    )
    if not merged:
        raise ValueError("Batch generation produced no files")
    return merged


def _repair_missing_essentials(
    goal: str,
    files: list[dict[str, str]],
    *,
    provider: str | None,
    on_relay: OnRelay | None,
) -> list[dict[str, str]]:
    """Fill critical paths missing after a partial salvage."""
    have = {f["path"] for f in files}
    if "package.json" in have:
        return files
    if not any(kw in goal.lower() for kw in ("react", "vite", "typescript")):
        return files
    missing = [p for p in _ESSENTIAL_PATHS if p not in have]
    if not missing:
        return files

    user = (
        f"User goal:\n{goal}\n\n"
        f"These files are missing from the project. Generate them now:\n"
        + "\n".join(f"- {p}" for p in missing[:6])
    )
    try:
        raw = _complete_codegen(
            _BATCH_SYSTEM,
            user,
            provider=provider,
            on_relay=on_relay,
            relay_kind="codegen_repair",
        )
        return _dedupe_files([*files, *_parse_files_json(raw)])
    except (ValueError, CompletionError) as exc:
        logger.warning("[codegen] essential repair skipped: %s", exc)
        return files


def generate_project_files(
    goal: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    on_relay: OnRelay | None = None,
    repair_hint: str | None = None,
) -> list[dict[str, str]]:
    """
    Ask the REASONING chain for project files.

    Tries a compact single response first, salvages truncated JSON, then falls
    back to manifest + batched generation.

    @raises CompletionError: when no provider succeeds.
    @raises ValueError: when all strategies fail.
    """
    del model, api_key, base_url  # resolved via Conductor candidates

    if repair_hint:
        user = f"{goal}\n\nRepair note: {repair_hint}"
        raw = _complete_codegen(
            _REPAIR_SYSTEM,
            user,
            provider=provider,
            on_relay=on_relay,
            relay_kind="codegen_repair",
        )
        return _parse_files_json(raw)

    last_err: Exception | None = None
    for attempt in range(_MAX_SINGLE_ATTEMPTS):
        try:
            raw = _complete_codegen(
                _SYSTEM,
                goal,
                provider=provider,
                on_relay=on_relay,
                relay_kind="codegen",
            )
            files = _parse_files_json(raw)
            return _repair_missing_essentials(goal, files, provider=provider, on_relay=on_relay)
        except (CompletionError, ValueError, json.JSONDecodeError) as exc:
            last_err = exc
            logger.warning("[codegen] generate attempt %s failed: %s", attempt + 1, exc)

    logger.info("[codegen] switching to manifest+batch generation after single-shot failure")
    try:
        return _generate_via_batches(goal, provider=provider, on_relay=on_relay)
    except (CompletionError, ValueError, json.JSONDecodeError) as exc:
        last_err = exc
        logger.warning("[codegen] batch generation failed: %s", exc)

    raise ValueError(str(last_err) if last_err else "Generation failed")


def _render_files_context(files: list[dict[str, str]]) -> str:
    """Compact, truncated snapshot of the project for a repair prompt."""
    chunks: list[str] = []
    total = 0
    for item in files[:_FIX_CONTEXT_FILE_LIMIT]:
        path = item.get("path", "")
        body = str(item.get("content", ""))
        if len(body) > _FIX_CONTEXT_FILE_CHARS:
            body = body[:_FIX_CONTEXT_FILE_CHARS] + "\n/* …truncated… */"
        block = f"--- {path} ---\n{body}"
        total += len(block)
        if total > _FIX_CONTEXT_TOTAL_CHARS:
            break
        chunks.append(block)
    return "\n\n".join(chunks)


def repair_project_files(
    goal: str,
    error_text: str,
    files: list[dict[str, str]],
    *,
    provider: str | None = None,
    on_relay: OnRelay | None = None,
    error_class: str | None = None,
) -> list[dict[str, str]]:
    """
    Fix a broken project given a build/dev-server error and current file contents.

    @param goal: original project goal (stack context).
    @param error_text: the build/dev-server error to fix.
    @param files: current project files as [{path, content}, ...].
    @param error_class: taxonomy class from classify_error() — adds a targeted hint.
    @return: only the files to create or replace.
    @raises ValueError: when no valid corrected files could be parsed.
    """
    context = _render_files_context(files)
    hint = _FIX_CLASS_HINTS.get(error_class or "")
    hint_block = f"{hint}\n\n" if hint else ""
    user = (
        f"Project goal:\n{goal}\n\n"
        f"{hint_block}"
        f"Build/dev-server error:\n{error_text.strip()[:2500]}\n\n"
        f"Current project files:\n{context}\n\n"
        "Return JSON with ONLY the files to create or replace to fix this error."
    )
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            raw = _complete_codegen(
                _FIX_SYSTEM,
                user if attempt == 0 else f"{user}\n\nYour previous JSON was invalid ({last_err}). Return smaller valid JSON.",
                provider=provider,
                on_relay=on_relay,
                relay_kind="codegen_fix",
            )
            return _parse_files_json(raw)
        except (CompletionError, ValueError, json.JSONDecodeError) as exc:
            last_err = exc
            logger.warning("[codegen] repair attempt %s failed: %s", attempt + 1, exc)
    raise ValueError(str(last_err) if last_err else "Repair generation failed")


def generate_patch_files(
    goal: str,
    existing_paths: list[str],
    *,
    provider: str | None = None,
    on_relay: OnRelay | None = None,
) -> list[dict[str, str]]:
    """Follow-up edits: return only changed/new files."""
    user = (
        f"User follow-up: {goal}\n\n"
        f"Existing project files: {', '.join(existing_paths[:80])}\n"
        "Return JSON files array with only files to create or replace."
    )
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            raw = _complete_codegen(
                _SYSTEM if attempt == 0 else _REPAIR_SYSTEM,
                user if attempt == 0 else f"{user}\n\nFix invalid JSON: {last_err}",
                provider=provider,
                on_relay=on_relay,
                relay_kind="codegen_patch",
            )
            return _parse_files_json(raw)
        except (CompletionError, ValueError, json.JSONDecodeError) as exc:
            last_err = exc
            logger.warning("[codegen] patch attempt %s failed: %s", attempt + 1, exc)
    raise ValueError(str(last_err) if last_err else "Patch generation failed")
