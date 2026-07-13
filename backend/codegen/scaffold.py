"""
Deterministic Vite + React + TypeScript + Tailwind scaffold.

The runnable skeleton (package.json, vite.config, tsconfig, index.html,
main.tsx) is emitted verbatim — never produced by the LLM — so the dev server
always starts and `npm run dev` always binds. The model only authors app files
(App.tsx, components, styles) on top of this base.
"""

from __future__ import annotations

import json

# Build-critical files the scaffold owns. The model is not allowed to overwrite
# these (package.json deps are merged instead) so the project stays runnable.
SCAFFOLD_OWNED_PATHS: frozenset[str] = frozenset(
    {
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        "vite.config.js",
        "tsconfig.json",
        "tsconfig.node.json",
        "tailwind.config.js",
        "tailwind.config.ts",
        "postcss.config.js",
        "postcss.config.cjs",
        "index.html",
        "src/main.tsx",
    }
)

# Pinned, mutually-compatible versions (Vite 5 / React 18 / Tailwind 3).
_BASE_DEPENDENCIES: dict[str, str] = {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
}
_BASE_DEV_DEPENDENCIES: dict[str, str] = {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.0",
}

_VITE_CONFIG = """\
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1" },
});
"""

_TSCONFIG = """\
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
"""

_TSCONFIG_NODE = """\
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
"""

_INDEX_HTML = """\
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"""

_MAIN_TSX = """\
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
"""

TAILWIND_DIRECTIVES = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n"

_INDEX_CSS = TAILWIND_DIRECTIVES

_TAILWIND_CONFIG = """\
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
"""

_POSTCSS_CONFIG = """\
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
"""

# Replaced by the model; keeps the project runnable before app files land.
_APP_PLACEHOLDER = """\
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
      <p className="text-lg">Loading…</p>
    </div>
  );
}
"""


def package_json_text(
    extra_dependencies: dict[str, str] | None = None,
    extra_dev_dependencies: dict[str, str] | None = None,
) -> str:
    """Render package.json with base deps plus any model-requested extras merged in."""
    dependencies = {**_BASE_DEPENDENCIES, **(extra_dependencies or {})}
    dev_dependencies = {**_BASE_DEV_DEPENDENCIES, **(extra_dev_dependencies or {})}
    pkg = {
        "name": "codegen-app",
        "private": True,
        "version": "0.0.0",
        "type": "module",
        "scripts": {
            "dev": "vite",
            "build": "vite build",
            "preview": "vite preview",
        },
        "dependencies": dict(sorted(dependencies.items())),
        "devDependencies": dict(sorted(dev_dependencies.items())),
    }
    return json.dumps(pkg, indent=2) + "\n"


def scaffold_files(extra_dependencies: dict[str, str] | None = None) -> list[dict[str, str]]:
    """The deterministic base project, ready to `npm install && npm run dev`."""
    return [
        {"path": "package.json", "content": package_json_text(extra_dependencies)},
        {"path": "vite.config.ts", "content": _VITE_CONFIG},
        {"path": "tsconfig.json", "content": _TSCONFIG},
        {"path": "tsconfig.node.json", "content": _TSCONFIG_NODE},
        {"path": "tailwind.config.js", "content": _TAILWIND_CONFIG},
        {"path": "postcss.config.js", "content": _POSTCSS_CONFIG},
        {"path": "index.html", "content": _INDEX_HTML},
        {"path": "src/main.tsx", "content": _MAIN_TSX},
        {"path": "src/index.css", "content": _INDEX_CSS},
        {"path": "src/App.tsx", "content": _APP_PLACEHOLDER},
    ]


def normalize_rel_path(path: str) -> str:
    return path.strip().replace("\\", "/").lstrip("/")


def partition_app_files(
    files: list[dict[str, str]],
) -> tuple[list[dict[str, str]], dict[str, str]]:
    """
    Split model output into writable app files vs. a deps overlay.

    Scaffold-owned files are dropped so the model can't break the build; if it
    emitted a package.json, its dependencies are returned for merging instead.
    """
    writable: list[dict[str, str]] = []
    extra_deps: dict[str, str] = {}
    for item in files:
        rel = normalize_rel_path(str(item.get("path", "")))
        if not rel:
            continue
        if rel == "package.json":
            extra_deps.update(_dependencies_from_package_json(str(item.get("content", ""))))
            continue
        if rel in SCAFFOLD_OWNED_PATHS:
            continue
        writable.append({"path": rel, "content": str(item.get("content", ""))})
    return writable, extra_deps


def _dependencies_from_package_json(text: str) -> dict[str, str]:
    try:
        pkg = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return {}
    deps: dict[str, str] = {}
    for key in ("dependencies", "devDependencies"):
        section = pkg.get(key)
        if isinstance(section, dict):
            for name, version in section.items():
                if isinstance(name, str) and isinstance(version, str):
                    deps[name] = version
    # Never let the model pin React/Vite/Tailwind to incompatible versions.
    for protected in (*_BASE_DEPENDENCIES, *_BASE_DEV_DEPENDENCIES):
        deps.pop(protected, None)
    return deps


def ensure_tailwind_directives(css: str) -> str:
    """Guarantee Tailwind layers exist so utility classes keep working."""
    if "@tailwind base" in css:
        return css
    return TAILWIND_DIRECTIVES + "\n" + css
