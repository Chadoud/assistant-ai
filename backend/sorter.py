"""
Handles the physical file operations: creating folders and moving/copying files.
"""

import pathlib
import shutil
from typing import Literal

from destination_path import destination_dir


def ensure_output_root(output_dir: str) -> None:
    """Create the sort output directory if it does not exist (before classify or apply)."""
    pathlib.Path(output_dir).expanduser().mkdir(parents=True, exist_ok=True)


def resolve_destination_path(
    source_path: str,
    output_dir: str,
    folder_name: str,
    *,
    on_collision: Literal["uniquify", "error"] = "uniquify",
) -> str:
    """
    Computes the destination path the sorter would use, without creating dirs or copying.
    When on_collision is 'error', raises FileExistsError if the natural dest file exists.
    ``folder_name`` may be a multi-segment relative path (e.g. Career/Job Applications).
    """
    dest_dir = destination_dir(output_dir, folder_name)
    source = pathlib.Path(source_path)
    dest = dest_dir / source.name
    if on_collision == "error" and dest.exists():
        raise FileExistsError(str(dest))
    if on_collision == "uniquify":
        counter = 1
        while dest.exists():
            dest = dest_dir / f"{source.stem} ({counter}){source.suffix}"
            counter += 1
    return str(dest)


def sort_file(
    source_path: str,
    output_dir: str,
    folder_name: str,
    mode: Literal["copy", "move"] = "copy",
    *,
    on_collision: Literal["uniquify", "error"] = "uniquify",
) -> str:
    """
    Places a file under output_dir following the normalized relative folder_name path.
    Returns the destination path.
    Raises on failure.
    """
    dest_dir = destination_dir(output_dir, folder_name)
    dest_dir.mkdir(parents=True, exist_ok=True)

    source = pathlib.Path(source_path)
    dest = pathlib.Path(
        resolve_destination_path(source_path, output_dir, folder_name, on_collision=on_collision)
    )

    if mode == "move":
        shutil.move(str(source), str(dest))
    else:
        shutil.copy2(str(source), str(dest))

    return str(dest)


def _build_folder_tree_node(folder: pathlib.Path, root: pathlib.Path) -> dict:
    files = sorted(f.name for f in folder.iterdir() if f.is_file())
    child_dirs = sorted((p for p in folder.iterdir() if p.is_dir()), key=lambda p: p.name.lower())
    children = [_build_folder_tree_node(child, root) for child in child_dirs]
    node: dict = {
        "name": folder.name,
        "path": str(folder),
        "files": files,
    }
    if children:
        node["children"] = children
    return node


def get_folder_tree(output_dir: str) -> list[dict]:
    """
    Returns top-level folder nodes under ``output_dir``, each optionally with ``children``
    for nested directories. Each node has name, path, files (files in that folder only).
    """
    root = pathlib.Path(output_dir).expanduser()
    if not root.exists():
        return []

    result: list[dict] = []
    for folder in sorted((p for p in root.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        result.append(_build_folder_tree_node(folder, root))
    return result


def _prune_empty_parents(dest_file: pathlib.Path, folder_name: str | None) -> None:
    """Remove empty destination directories upward, bounded by segment depth of ``folder_name``."""
    rel = (folder_name or "").strip().replace("\\", "/").strip("/")
    max_levels = max(1, rel.count("/") + 1) if rel else 1
    cur = dest_file.parent
    for _ in range(max_levels):
        try:
            if cur.is_dir() and not any(cur.iterdir()):
                parent = cur.parent
                cur.rmdir()
                cur = parent
            else:
                break
        except OSError:
            break


def undo_sort(
    source_path: str,
    dest_path: str,
    original_mode: str,
    *,
    folder_name: str | None = None,
) -> bool:
    """
    Reverses a sort operation.
    - If original was 'move': moves dest back to source location.
    - If original was 'copy': deletes the copied file.
    When ``folder_name`` is set (history entry), removes nested empty parent dirs up to its depth.
    Returns True on success.
    """
    dest = pathlib.Path(dest_path)
    if not dest.exists():
        return False

    if original_mode == "move":
        source = pathlib.Path(source_path)
        source.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(dest), str(source))
    else:
        dest.unlink()

    if folder_name:
        _prune_empty_parents(pathlib.Path(dest_path), folder_name)
    else:
        try:
            pathlib.Path(dest_path).parent.rmdir()
        except OSError:
            pass

    return True
