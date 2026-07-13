"""User-defined rules: first match by priority wins (filename glob)."""

from __future__ import annotations

import fnmatch
import pathlib
from typing import Any, Literal

from pydantic import BaseModel

from destination_path import normalize_rel_dest


class UserRule(BaseModel):
    id: str = ""
    enabled: bool = True
    """Higher runs first among enabled rules."""
    priority: int = 0
    """fnmatch pattern against file basename, e.g. *.pdf or invoice_*"""
    pattern: str = "*"
    action: Literal["target_folder", "skip"] = "target_folder"
    """Relative destination under output (single segment or Parent/Leaf, normalized)."""
    folder: str | None = None


class RuleMatch(BaseModel):
    rule_id: str
    skip: bool = False
    folder: str | None = None


def first_matching_rule(file_path: str, rules: list[Any]) -> RuleMatch | None:
    """
    Returns the highest-priority enabled rule that matches the file basename.
    `rules` may be dicts or UserRule instances.
    """
    if not rules:
        return None
    path = pathlib.Path(file_path)
    basename = path.name
    parsed: list[UserRule] = []
    for r in rules:
        try:
            if isinstance(r, UserRule):
                parsed.append(r)
            elif isinstance(r, dict):
                parsed.append(UserRule.model_validate(r))
        except Exception:
            continue
    enabled = [u for u in parsed if u.enabled and u.pattern.strip()]
    enabled.sort(key=lambda u: u.priority, reverse=True)
    for rule in enabled:
        if fnmatch.fnmatch(basename, rule.pattern.strip()):
            rid = rule.id.strip() or rule.pattern
            if rule.action == "skip":
                return RuleMatch(rule_id=rid, skip=True, folder=None)
            raw_folder = (rule.folder or "").strip()
            if not raw_folder:
                continue
            folder = normalize_rel_dest(raw_folder)
            if not folder:
                continue
            return RuleMatch(rule_id=rid, skip=False, folder=folder)
    return None
