import type { UserRule } from "../types/settings";

interface RulePackFile {
  id?: string;
  version?: number | string;
  name?: string;
  rules: unknown;
}

function isUserRule(x: unknown): x is UserRule {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.enabled === "boolean" &&
    typeof o.priority === "number" &&
    typeof o.pattern === "string" &&
    (o.action === "target_folder" || o.action === "skip") &&
    (o.action !== "target_folder" || typeof o.folder === "string")
  );
}

/** Parse uploaded or fetched rule pack JSON; returns normalized rules to merge. */
export function parseRulePackJson(raw: unknown): UserRule[] {
  if (!raw || typeof raw !== "object") throw new Error("Rule pack must be a JSON object.");
  const o = raw as RulePackFile;
  if (!Array.isArray(o.rules)) throw new Error('Rule pack must include a "rules" array.');
  const out: UserRule[] = [];
  for (const item of o.rules) {
    if (!isUserRule(item)) continue;
    out.push({
      id: item.id,
      enabled: item.enabled,
      priority: item.priority,
      pattern: item.pattern,
      action: item.action,
      folder: item.action === "target_folder" ? item.folder : undefined,
    });
  }
  if (!out.length) throw new Error("No valid rules found in pack.");
  return out;
}

/** Merge pack rules after existing; skip ids already present. */
export function mergeRulePack(existing: UserRule[], incoming: UserRule[]): UserRule[] {
  const ids = new Set(existing.map((r) => r.id));
  const merged = [...existing];
  for (const r of incoming) {
    if (ids.has(r.id)) continue;
    merged.push(r);
    ids.add(r.id);
  }
  return merged;
}
