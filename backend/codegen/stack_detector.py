"""Infer install/dev commands from generated project files."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StackPlan:
    stack_label: str
    install_command: str | None
    dev_command: str
    port_hint: int | None = None

    @property
    def needs_install(self) -> bool:
        return bool(self.install_command and self.install_command.strip())


def _read_package_json(root: Path) -> dict | None:
    pkg = root / "package.json"
    if not pkg.is_file():
        return None
    try:
        return json.loads(pkg.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.info("[codegen] invalid package.json: %s", exc)
        return None


def _infer_label_from_deps(dep_names: set[str], scripts: dict) -> str:
    if any(k == "nuxt" or k.startswith("@nuxt") for k in dep_names):
        return "nuxt"
    if "next" in dep_names:
        return "next"
    if "vite" in dep_names:
        return "vite"
    if "react-scripts" in dep_names:
        return "cra"
    if "vue" in dep_names or "@vue/" in " ".join(dep_names):
        return "vue"
    if "svelte" in dep_names or "@sveltejs/" in " ".join(dep_names):
        return "svelte"
    if "astro" in dep_names:
        return "astro"
    if "angular" in dep_names or "@angular/" in " ".join(dep_names):
        return "angular"
    if isinstance(scripts, dict) and scripts:
        return "node"
    return "node"


def _dev_command_for_dev_script(label: str, default_port: int) -> str:
    """
    Build the `dev` command, forwarding host/port so the server binds to the
    address the preview loads (``127.0.0.1:<default_port>``).

    A bare ``npm run dev`` lets the framework pick its own default (e.g. Vite on
    ``localhost:5173``), which the ``127.0.0.1:<port>`` preview cannot reach.
    npm forwards args after ``--`` to the underlying script.
    """
    vite_like = {"vite", "vue", "svelte", "astro", "nuxt"}
    if label in vite_like:
        return f"npm run dev -- --host 127.0.0.1 --port {default_port}"
    if label == "next":
        return f"npm run dev -- -p {default_port} -H 127.0.0.1"
    return "npm run dev"


def _lockfile_install(root: Path) -> str:
    if (root / "pnpm-lock.yaml").is_file():
        return "pnpm install"
    if (root / "yarn.lock").is_file():
        return "yarn install"
    return "npm install"


def detect_stack(project_root: str | Path, *, default_port: int = 5300) -> StackPlan:
    """
    Resolve install and dev commands for a generated project directory.

    @raises ValueError: when no runnable dev strategy is found.
    """
    root = Path(project_root).expanduser().resolve()
    pkg = _read_package_json(root)
    install = _lockfile_install(root)

    if pkg:
        scripts = pkg.get("scripts") if isinstance(pkg.get("scripts"), dict) else {}
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        dep_names = {str(k).lower() for k in deps} if isinstance(deps, dict) else set()

        if (root / "angular.json").is_file():
            return StackPlan("angular", install, "npm run start", default_port)

        if isinstance(scripts, dict) and "dev" in scripts:
            label = _infer_label_from_deps(dep_names, scripts)
            return StackPlan(
                label, install, _dev_command_for_dev_script(label, default_port), default_port
            )

        if isinstance(scripts, dict) and "start" in scripts:
            return StackPlan("cra", install, "npm start", default_port)

        if isinstance(scripts, dict) and "serve" in scripts:
            return StackPlan("node", install, "npm run serve", default_port)

        if "vite" in dep_names:
            return StackPlan("vite", install, f"npx vite --host 127.0.0.1 --port {default_port}", default_port)

        if "next" in dep_names:
            return StackPlan("next", install, f"npx next dev -p {default_port}", default_port)

    if (root / "index.html").is_file():
        # Static HTML — serve via npx; no package.json so never run npm install.
        return StackPlan(
            "static",
            None,
            f"npx --yes serve -l tcp://127.0.0.1:{default_port}",
            default_port,
        )

    raise ValueError(
        "Could not find a dev script in package.json and no static index.html — "
        "add a dev/start script or include package.json with dependencies."
    )
