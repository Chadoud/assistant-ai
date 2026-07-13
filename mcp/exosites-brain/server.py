#!/usr/bin/env python3
"""MCP server exposing Exosites second-brain read tools."""

from __future__ import annotations

import json
import sys
from typing import Any


def _search_memories(query: str, limit: int = 8) -> dict[str, Any]:
    from actions.recall_tools import search_memories

    return search_memories({"query": query, "limit": limit})


def _search_everything(query: str, limit: int = 12) -> dict[str, Any]:
    from actions.recall_tools import search_everything

    return search_everything({"query": query, "limit": limit})


def _list_tasks() -> dict[str, Any]:
    from actions.recall_tools import list_tasks

    return list_tasks({"include_completed": False})


def _handle(method: str, params: dict[str, Any]) -> dict[str, Any]:
    if method == "tools/list":
        return {
            "tools": [
                {"name": "search_memories", "description": "Search assistant memory"},
                {"name": "search_everything", "description": "Unified second-brain search"},
                {"name": "list_tasks", "description": "List open tasks"},
            ]
        }
    if method == "tools/call":
        name = params.get("name")
        args = params.get("arguments") or {}
        if name == "search_memories":
            result = _search_memories(str(args.get("query", "")))
        elif name == "search_everything":
            result = _search_everything(str(args.get("query", "")))
        elif name == "list_tasks":
            result = _list_tasks()
        else:
            return {"error": f"unknown tool {name}"}
        return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}
    return {"error": f"unsupported method {method}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        resp = {"jsonrpc": "2.0", "id": req.get("id"), "result": _handle(req.get("method", ""), req.get("params") or {})}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
