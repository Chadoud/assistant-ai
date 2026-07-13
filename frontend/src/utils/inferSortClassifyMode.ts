import type { AppSettings, SortClassifyMode } from "../types/settings";
import type { SortStructureTemplate } from "../types/sortStructure";

const VALID_MODES = new Set<SortClassifyMode>(["builtin", "structure", "custom"]);

/**
 * Infer classify mode from legacy settings when `sortClassifyMode` is missing.
 * Structure wins when both template and custom prompt were active.
 */
export function inferSortClassifyModeFromLegacy(
  sortSystemPrompt: string,
  sortStructureTemplate: SortStructureTemplate
): SortClassifyMode {
  if (sortStructureTemplate?.enabled && sortStructureTemplate.modules.length > 0) {
    return "structure";
  }
  if (sortSystemPrompt?.trim()) return "custom";
  return "builtin";
}

/** Resolve the effective classify mode from persisted settings. */
export function resolveSortClassifyMode(
  settings: Pick<AppSettings, "sortClassifyMode" | "sortSystemPrompt" | "sortStructureTemplate">
): SortClassifyMode {
  const stored = settings.sortClassifyMode;
  if (stored && VALID_MODES.has(stored)) return stored;
  return inferSortClassifyModeFromLegacy(settings.sortSystemPrompt, settings.sortStructureTemplate);
}
