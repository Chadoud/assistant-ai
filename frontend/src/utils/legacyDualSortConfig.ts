import type { AppSettings } from "../types/settings";
import { resolveSortClassifyMode } from "./inferSortClassifyMode";

const LEGACY_DUAL_SORT_CONFIG_DISMISSED_KEY = "exosites.sortInstructions.dualConfigDismissed.v1";

/**
 * True when the user previously had both structure template and custom prompt active.
 * After migration, mode is structure and prompt text is retained but not sent on jobs.
 */
export function hasLegacyDualSortConfig(settings: AppSettings): boolean {
  const mode = resolveSortClassifyMode(settings);
  const tpl = settings.sortStructureTemplate;
  const hasStructure = Boolean(tpl?.enabled && tpl.modules.length > 0);
  const hasPrompt = Boolean(settings.sortSystemPrompt?.trim());
  return mode === "structure" && hasStructure && hasPrompt;
}

export function isLegacyDualSortConfigDismissed(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(LEGACY_DUAL_SORT_CONFIG_DISMISSED_KEY) === "1";
}

export function dismissLegacyDualSortConfig(): void {
  sessionStorage.setItem(LEGACY_DUAL_SORT_CONFIG_DISMISSED_KEY, "1");
}
