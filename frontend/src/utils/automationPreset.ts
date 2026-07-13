import type { AppSettings, AutomationPreset } from "../types/settings";

/** Default explicit floor when preset is Custom and none is set yet (fraction 0–1). */
export const DEFAULT_CUSTOM_MIN_CONFIDENCE = 0.1;

/** Float threshold for Strict preset (more items → Uncertain). */
export const PRESET_MIN_STRICT = 0.72;
/** Fewer review items; higher wrong-folder risk. */
export const PRESET_MIN_AGGRESSIVE = 0.42;

export function isAutomationPreset(v: unknown): v is AutomationPreset {
  return v === "strict" || v === "balanced" || v === "aggressive" || v === "custom";
}

/** Value sent on `/analyze`: strict/aggressive set explicit floors; balanced uses server default. */
export function effectiveMinConfidenceForJob(settings: Pick<AppSettings, "automationPreset" | "minConfidence">): number | undefined {
  switch (settings.automationPreset) {
    case "strict":
      return PRESET_MIN_STRICT;
    case "balanced":
      return undefined;
    case "aggressive":
      return PRESET_MIN_AGGRESSIVE;
    case "custom":
      return settings.minConfidence ?? undefined;
    default:
      return settings.minConfidence ?? undefined;
  }
}
