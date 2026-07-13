import type { AppSettings } from "../types/settings";
import { isChatReady } from "./chatReadiness";

export type SetupReadinessOptions = {
  /** Sort/classify runs on Exo servers — no local Ollama model install required. */
  remoteSortLlm?: boolean;
};

/** Sort pipeline ready: output folder; local mode also needs a configured sort model. */
export function isSortSetupComplete(
  settings: AppSettings,
  options?: SetupReadinessOptions
): boolean {
  if (!settings.outputDir.trim()) return false;
  if (options?.remoteSortLlm) return true;
  return Boolean(settings.model.trim());
}

/**
 * Minimum setup to leave the welcome wizard without treating setup as "skipped".
 * Cloud sort needs only an output folder; local mode needs a model or Gemini for chat.
 */
export function isWelcomeSetupComplete(
  settings: AppSettings,
  options?: SetupReadinessOptions
): boolean {
  if (!settings.outputDir.trim()) return false;
  if (options?.remoteSortLlm) return true;
  return Boolean(settings.model.trim() || isChatReady(settings));
}
