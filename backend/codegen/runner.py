"""Run a codegen session: generate files, detect stack, stream SSE events."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from actions.write_project_files import write_project_files
from codegen.dependency_reconciler import (
    merged_package_json_text,
    missing_dependencies,
    version_for_package,
)
from codegen.error_taxonomy import ErrorClass, ErrorDiagnosis, classify_error
from codegen.generator import (
    generate_app_files,
    generate_patch_files,
    generate_project_files,
    plan_build,
    repair_project_files,
)
from codegen.import_resolver import describe_missing_imports, find_unresolved_local_imports
from codegen.install_policy import (
    dependency_manifests_touched,
    should_reuse_dev_server,
    should_skip_install,
    stack_requires_install,
)
from codegen.scaffold import (
    ensure_tailwind_directives,
    normalize_rel_path,
    package_json_text,
    partition_app_files,
    scaffold_files,
)
from codegen.session_store import CodegenSession, SessionStatus, _persist_snapshot
from codegen.stack_detector import detect_stack

logger = logging.getLogger(__name__)

# Source/config files worth sending to the model when repairing a broken build.
_CONTEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
    ".css", ".scss", ".html", ".vue", ".svelte",
}
_CONTEXT_FILE_BYTES = 8 * 1024
_CONTEXT_FILE_LIMIT = 40
_MAX_PREFLIGHT_REPAIRS = 2
# LLM repair calls per session; deterministic fixes don't consume this budget.
_MAX_LLM_REPAIRS = 3

# The user explicitly wants a plain static page with no build step.
_STATIC_GOAL_RE = re.compile(
    r"\b(static\s+(site|page|html)|plain\s+html|just\s+html|no\s+(npm|build|framework|bundler))\b",
    re.IGNORECASE,
)


def _wants_static_site(goal: str) -> bool:
    return bool(_STATIC_GOAL_RE.search(goal))


def _make_event(type_: str, **payload) -> str:
    return json.dumps({"type": type_, **payload})


def _collect_project_sources(project_path: str) -> list[dict[str, str]]:
    """Read text source/config files (skip node_modules, lockfiles) for repair context."""
    from pathlib import Path

    root = Path(project_path).expanduser().resolve()
    if not root.is_dir():
        return []
    out: list[dict[str, str]] = []
    for path in sorted(root.rglob("*")):
        if len(out) >= _CONTEXT_FILE_LIMIT:
            break
        if "node_modules" in path.parts or not path.is_file():
            continue
        if path.name == "package-lock.json" or path.suffix not in _CONTEXT_SUFFIXES:
            continue
        try:
            if path.stat().st_size > _CONTEXT_FILE_BYTES * 4:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")[: _CONTEXT_FILE_BYTES]
        except OSError:
            continue
        out.append({"path": path.relative_to(root).as_posix(), "content": text})
    return out


async def _write_and_emit(session: CodegenSession, files: list[dict[str, str]]) -> list[str]:
    """Write generated files to disk and emit a file_written event per file."""
    result = await asyncio.to_thread(
        write_project_files,
        {"session_id": session.session_id, "files": files},
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("error") or "Failed to write files")
    written = list(result.get("data", {}).get("written", []))
    session.files_written += int(result.get("data", {}).get("count", 0))
    for rel in written:
        await session.events.put(_make_event("file_written", path=rel, total=session.files_written))
    return written


async def _generate_follow_up(session: CodegenSession, on_relay) -> list[str]:
    """Patch an existing project for an iterative follow-up request."""
    from actions.write_project_files import list_project_tree

    listing = list_project_tree({"session_id": session.session_id})
    paths: list[str] = []
    if listing.get("ok"):
        paths = [f["path"] for f in listing.get("data", {}).get("files", []) if isinstance(f, dict)]
    files = await asyncio.to_thread(
        generate_patch_files, session.goal, paths, provider=session.provider, on_relay=on_relay
    )
    return await _write_and_emit(session, files)


async def _generate_freeform(session: CodegenSession, on_relay) -> list[str]:
    """Static/plain build: let the model emit the full file set (no scaffold)."""
    files = await asyncio.to_thread(
        generate_project_files,
        session.goal,
        provider=session.provider,
        model=session.model,
        api_key=session.api_key,
        base_url=session.base_url,
        on_relay=on_relay,
    )
    return await _write_and_emit(session, files)


async def _build_with_scaffold(session: CodegenSession, plan: dict, on_relay) -> list[str]:
    """
    Write the deterministic Vite+React+TS scaffold, then generate ONLY the
    app files from the AI plan. The runnable skeleton is never AI-authored, so
    `npm run dev` always starts.
    """
    extra_deps = dict(plan.get("dependencies") or {})

    session.status = SessionStatus.scaffolding
    _persist_snapshot(session)
    await session.events.put(_make_event("phase", phase="scaffolding"))
    await _write_and_emit(session, scaffold_files(extra_deps))

    session.status = SessionStatus.generating
    await session.events.put(_make_event("phase", phase="generating"))
    app_files = plan.get("app_files") or ["src/App.tsx"]
    generated = await asyncio.to_thread(
        generate_app_files, session.goal, app_files, provider=session.provider, on_relay=on_relay
    )

    writable, model_deps = partition_app_files(generated)
    for item in writable:
        if normalize_rel_path(item["path"]) == "src/index.css":
            item["content"] = ensure_tailwind_directives(item["content"])
    written = await _write_and_emit(session, writable)

    if model_deps:
        merged = {**extra_deps, **model_deps}
        await _write_and_emit(session, [{"path": "package.json", "content": package_json_text(merged)}])
    return written


async def _produce_project(session: CodegenSession, is_follow_up: bool, on_relay) -> list[str]:
    """Route to the right generation strategy and return the written paths."""
    if is_follow_up:
        return await _generate_follow_up(session, on_relay)
    if _wants_static_site(session.goal):
        return await _generate_freeform(session, on_relay)

    session.status = SessionStatus.planning
    _persist_snapshot(session)
    await session.events.put(_make_event("phase", phase="planning"))
    plan = await asyncio.to_thread(
        plan_build, session.goal, provider=session.provider, on_relay=on_relay
    )
    session.plan_steps = list(plan.get("steps") or [])
    session.stack_label = str(plan.get("stack") or session.stack_label or "")
    _persist_snapshot(session)
    await session.events.put(
        _make_event("plan", steps=session.plan_steps, stack=plan.get("stack", ""))
    )
    return await _build_with_scaffold(session, plan, on_relay)


async def _heal_unresolved_imports(session: CodegenSession, on_relay) -> None:
    """Pre-flight: create files referenced by imports that were never written."""
    project_path = session.project_path or ""
    for _ in range(_MAX_PREFLIGHT_REPAIRS):
        missing = await asyncio.to_thread(find_unresolved_local_imports, project_path)
        if not missing:
            return
        logger.info("[codegen] healing %d unresolved import(s) before preview", len(missing))
        await session.events.put(
            _make_event("self_correct", reason="unresolved_imports", count=len(missing))
        )
        sources = await asyncio.to_thread(_collect_project_sources, project_path)
        try:
            fixed = await asyncio.to_thread(
                repair_project_files,
                session.goal,
                describe_missing_imports(missing),
                sources,
                provider=session.provider,
                on_relay=on_relay,
            )
        except Exception as exc:  # noqa: BLE001 - pre-flight repair is best-effort
            logger.warning("[codegen] pre-flight import repair failed: %s", exc)
            return
        await _write_and_emit(session, fixed)


async def _reconcile_missing_packages(session: CodegenSession) -> list[str]:
    """
    Ground-truth check before install: every bare import in the generated code
    must be declared in package.json. Merges missing packages in so the classic
    "imported `uuid` but never declared it" failure can't reach the dev server.
    """
    project_path = session.project_path or ""
    additions = await asyncio.to_thread(missing_dependencies, project_path)
    if not additions:
        return []
    text = await asyncio.to_thread(merged_package_json_text, project_path, additions)
    if text is None:
        return []
    logger.info("[codegen] reconciling %d undeclared package(s): %s", len(additions), sorted(additions))
    await session.events.put(
        _make_event(
            "self_correct",
            reason="missing_dependencies",
            count=len(additions),
            packages=sorted(additions),
        )
    )
    return await _write_and_emit(session, [{"path": "package.json", "content": text}])


async def run_session(session: CodegenSession, *, is_follow_up: bool = False) -> None:
    """Generate files and emit events. Dev server is started by the Electron renderer."""
    session.status = SessionStatus.generating
    await session.events.put(_make_event("session_start", goal=session.goal, session_id=session.session_id))

    loop = asyncio.get_running_loop()

    def _on_relay(from_id: str, to_id: str, reason: str) -> None:
        asyncio.run_coroutine_threadsafe(
            session.events.put(_make_event("provider_relay", from_provider=from_id, to=to_id, reason=reason)),
            loop,
        )

    try:
        if session.cancel_event.is_set():
            raise asyncio.CancelledError()

        is_static = _wants_static_site(session.goal)
        written_paths = await _produce_project(session, is_follow_up, _on_relay)

        # Pre-flight self-correction: create any files referenced by imports that
        # were never written (the classic "imported ./App.tsx but never wrote it").
        if not is_static:
            await _heal_unresolved_imports(session, _on_relay)

        # Pre-flight dependency reconciliation: undeclared bare imports become
        # package.json entries before the first install (no-op for static sites).
        written_paths.extend(await _reconcile_missing_packages(session))

        skip_install = should_skip_install(
            session.project_path or "",
            written_paths,
            is_follow_up=is_follow_up,
        )
        reuse_dev = should_reuse_dev_server(written_paths, is_follow_up=is_follow_up)

        stack = await asyncio.to_thread(detect_stack, session.project_path or "")
        session.stack_label = stack.stack_label
        session.install_command = stack.install_command
        session.dev_command = stack.dev_command
        session.status = SessionStatus.installing
        _persist_snapshot(session)

        skip_install = skip_install or not stack_requires_install(
            session.project_path or "",
            stack.install_command,
        )

        await session.events.put(
            _make_event(
                "awaiting_dev",
                session_id=session.session_id,
                project_path=session.project_path,
                stack_label=stack.stack_label,
                install_command=stack.install_command or "",
                dev_command=stack.dev_command,
                port_hint=stack.port_hint,
                files_written=session.files_written,
                skip_install=skip_install,
                reuse_dev_server=reuse_dev,
            )
        )
    except asyncio.CancelledError:
        session.status = SessionStatus.cancelled
        await session.events.put(_make_event("session_cancelled"))
    except Exception as exc:
        logger.exception("[codegen] session %s failed", session.session_id)
        session.status = SessionStatus.failed
        session.error = str(exc)
        _persist_snapshot(session)
        await session.events.put(_make_event("session_error", error=str(exc)))
    finally:
        await session.events.put(None)


def _is_scaffolded_project(project_path: str) -> bool:
    """True when the project runs on our deterministic scaffold (protect its files)."""
    from pathlib import Path

    try:
        pkg = json.loads((Path(project_path) / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return isinstance(pkg, dict) and pkg.get("name") == "codegen-app"


async def _write_repair_batch(session: CodegenSession, files: list[dict[str, str]]) -> list[str]:
    """Path-safe write of repair output; returns the written relative paths."""
    if not files:
        return []
    result = await asyncio.to_thread(
        write_project_files,
        {"session_id": session.session_id, "files": files},
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("error") or "Failed to write repaired files.")
    session.files_written += int(result.get("data", {}).get("count", 0))
    return list(result.get("data", {}).get("written", []))


async def _deterministic_repair(session: CodegenSession, diagnosis: ErrorDiagnosis) -> dict | None:
    """
    Fix machine-recognizable errors without an LLM call.

    @return: {"changed": [...], "needs_install": bool} when the class was
             handled, or None to fall through to the LLM tier.
    """
    project_path = session.project_path or ""

    if diagnosis.error_class is ErrorClass.missing_npm_package and diagnosis.packages:
        additions = {name: version_for_package(name) for name in diagnosis.packages}
        # Sweep the whole project so one pass catches every undeclared import.
        additions.update(await asyncio.to_thread(missing_dependencies, project_path))
        text = await asyncio.to_thread(merged_package_json_text, project_path, additions)
        if text is None:
            # Already declared — the package just never got installed (e.g. a
            # prior repair skipped install). Forcing a full install is the fix.
            return {"changed": [], "needs_install": True}
        changed = await _write_repair_batch(
            session, [{"path": "package.json", "content": text}]
        )
        return {"changed": changed, "needs_install": True}

    if diagnosis.error_class is ErrorClass.install_registry_error and diagnosis.packages:
        # A hallucinated version (E404/ETARGET) — fall back to the registry's latest.
        additions = {name: "latest" for name in diagnosis.packages}
        text = await asyncio.to_thread(
            merged_package_json_text, project_path, additions, overwrite_versions=True
        )
        if text is None:
            return None
        changed = await _write_repair_batch(
            session, [{"path": "package.json", "content": text}]
        )
        return {"changed": changed, "needs_install": True}

    return None


async def _llm_repair(
    session: CodegenSession, error_text: str, diagnosis: ErrorDiagnosis
) -> tuple[list[str], bool]:
    """LLM tier: targeted repair prompt, scaffold-protected writes, dep reconcile."""
    project_path = session.project_path or ""
    hint_text = error_text or "The dev server reported a build error."
    if diagnosis.error_class is ErrorClass.missing_local_file:
        missing = await asyncio.to_thread(find_unresolved_local_imports, project_path)
        if missing:
            hint_text = f"{hint_text}\n\n{describe_missing_imports(missing)}"

    sources = await asyncio.to_thread(_collect_project_sources, project_path)
    # Files named in the error are the most relevant context — put them first
    # so they survive the repair prompt's size caps.
    sources.sort(key=lambda item: 0 if item["path"] in hint_text else 1)
    fixed = await asyncio.to_thread(
        repair_project_files,
        session.goal,
        hint_text,
        sources,
        provider=session.provider,
        error_class=diagnosis.error_class.value,
    )

    protect = await asyncio.to_thread(_is_scaffolded_project, project_path)
    if protect:
        writable, model_deps = partition_app_files(fixed)
        for item in writable:
            if normalize_rel_path(item["path"]) == "src/index.css":
                item["content"] = ensure_tailwind_directives(item["content"])
        if model_deps:
            text = await asyncio.to_thread(merged_package_json_text, project_path, model_deps)
            if text:
                writable.append({"path": "package.json", "content": text})
    else:
        writable = fixed

    changed = await _write_repair_batch(session, writable)
    needs_install = dependency_manifests_touched(changed)

    # Repairs can introduce new bare imports of their own — reconcile again.
    additions = await asyncio.to_thread(missing_dependencies, project_path)
    if additions:
        text = await asyncio.to_thread(merged_package_json_text, project_path, additions)
        if text:
            changed.extend(await _write_repair_batch(session, [{"path": "package.json", "content": text}]))
            needs_install = True
    return changed, needs_install


async def repair_session_files(session: CodegenSession, error_text: str) -> dict:
    """
    Self-correct a broken preview with a diagnose → act → verify loop.

    Classifies the error first and applies a deterministic fix when the class
    is machine-recognizable (missing npm package, hallucinated version). The
    LLM tier is bounded and never re-run against an identical error fingerprint.

    @return: {ok, changed, count, needs_install, strategy, error_class, packages}
             — never raises to the route.
    """
    project_path = session.project_path or ""
    if not project_path:
        return {"ok": False, "error": "Session has no project to repair."}

    diagnosis = classify_error(error_text)
    same_error = bool(diagnosis.fingerprint) and diagnosis.fingerprint == session.last_error_fingerprint
    error_class = diagnosis.error_class.value
    packages = list(diagnosis.packages)

    def _record_attempt(strategy: str) -> None:
        session.repair_attempts += 1
        session.last_error_fingerprint = diagnosis.fingerprint
        session.last_repair_strategy = strategy
        _persist_snapshot(session)

    try:
        # Tier 1 — deterministic, unless it already failed on this exact error.
        if not (same_error and session.last_repair_strategy == "deterministic"):
            deterministic = await _deterministic_repair(session, diagnosis)
            if deterministic is not None:
                _record_attempt("deterministic")
                logger.info(
                    "[codegen] deterministic repair (%s) for session %s: %s",
                    error_class, session.session_id, deterministic["changed"] or "force install",
                )
                return {
                    "ok": True,
                    "strategy": "deterministic",
                    "error_class": error_class,
                    "packages": packages,
                    "changed": deterministic["changed"],
                    "count": len(deterministic["changed"]),
                    "needs_install": deterministic["needs_install"],
                }

        # Tier 2 — LLM, bounded and never repeated against an unchanged error.
        if same_error and session.last_repair_strategy == "llm":
            return {
                "ok": False,
                "error": "The same build error came back after an automatic fix.",
                "error_class": error_class,
                "packages": packages,
                "budget_exhausted": True,
            }
        if session.llm_repair_attempts >= _MAX_LLM_REPAIRS:
            return {
                "ok": False,
                "error": "Automatic fix limit reached for this build.",
                "error_class": error_class,
                "packages": packages,
                "budget_exhausted": True,
            }

        changed, needs_install = await _llm_repair(session, error_text, diagnosis)
        session.llm_repair_attempts += 1
        _record_attempt("llm")
        logger.info(
            "[codegen] LLM repair (%s) wrote %d file(s) for session %s",
            error_class, len(changed), session.session_id,
        )
        return {
            "ok": True,
            "strategy": "llm",
            "error_class": error_class,
            "packages": packages,
            "changed": changed,
            "count": len(changed),
            "needs_install": needs_install,
        }
    except Exception as exc:  # noqa: BLE001 - surface a clean error to the renderer
        logger.warning("[codegen] repair_session_files failed: %s", exc)
        return {"ok": False, "error": str(exc), "error_class": error_class, "packages": packages}


def mark_preview_ready(session: CodegenSession, url: str, log_tail: str = "") -> None:
    """Called when the renderer reports the dev server is up."""
    from codegen.session_store import SessionStatus as SS

    session.preview_url = url
    session.status = SS.ready
    session.log_tail = log_tail[-8000:]
    _persist_snapshot(session)


async def stream_session_events(session: CodegenSession):
    """Yield SSE strings for a codegen session."""
    while True:
        try:
            event_json = await asyncio.wait_for(session.events.get(), timeout=30.0)
        except asyncio.TimeoutError:
            yield "data: " + _make_event("heartbeat") + "\n\n"
            continue
        if event_json is None:
            break
        yield "data: " + event_json + "\n\n"
