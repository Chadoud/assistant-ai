"""Tests for the deterministic Vite+React scaffold and dep-merge helpers."""

import json

from codegen.scaffold import (
    ensure_tailwind_directives,
    package_json_text,
    partition_app_files,
    scaffold_files,
)


def test_scaffold_package_json_is_valid_and_has_dev_script():
    files = {f["path"]: f["content"] for f in scaffold_files()}
    assert "package.json" in files
    pkg = json.loads(files["package.json"])
    assert pkg["scripts"]["dev"] == "vite"
    assert "react" in pkg["dependencies"]
    assert "vite" in pkg["devDependencies"]


def test_scaffold_includes_runnable_entrypoints():
    paths = {f["path"] for f in scaffold_files()}
    for required in ("index.html", "src/main.tsx", "src/index.css", "src/App.tsx"):
        assert required in paths


def test_package_json_merges_extra_dependencies():
    pkg = json.loads(package_json_text({"date-fns": "^3.0.0"}))
    assert pkg["dependencies"]["date-fns"] == "^3.0.0"
    # Base deps still present and protected.
    assert pkg["dependencies"]["react"] == "^18.3.1"


def test_partition_drops_scaffold_files_and_merges_pkg_deps():
    generated = [
        {"path": "src/App.tsx", "content": "export default function App(){return null}"},
        {"path": "src/components/Feed.tsx", "content": "export const Feed = () => null;"},
        {"path": "vite.config.ts", "content": "// model tried to overwrite the config"},
        {"path": "package.json", "content": json.dumps({"dependencies": {"zustand": "^4.5.0", "react": "^17"}})},
    ]
    writable, extra_deps = partition_app_files(generated)
    written_paths = {f["path"] for f in writable}
    assert written_paths == {"src/App.tsx", "src/components/Feed.tsx"}
    # vite.config.ts and package.json were stripped from writable output.
    assert "vite.config.ts" not in written_paths
    # zustand is merged; the protected react pin from the model is ignored.
    assert extra_deps == {"zustand": "^4.5.0"}


def test_ensure_tailwind_directives_prepends_when_missing():
    fixed = ensure_tailwind_directives(".btn { color: red; }")
    assert fixed.startswith("@tailwind base;")
    # Already-present directives are left untouched.
    already = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n.btn{}"
    assert ensure_tailwind_directives(already) == already
