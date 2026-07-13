import type { AppSettings } from "../types/settings";

/**
 * Optional field for analyze / Gmail job requests when the user has a custom sort system prompt.
 */
export function sortSystemPromptRequestField(
  settings: AppSettings
): { sort_system_prompt?: string } {
  const s = settings.sortSystemPrompt?.trim();
  return s ? { sort_system_prompt: s } : {};
}

/** Optional per-job override for the filing briefing LLM (omit when following server default). */
export function documentBriefingRequestField(
  settings: AppSettings
): { document_briefing_enable?: boolean } {
  const v = settings.documentBriefingEnable;
  if (v === null || v === undefined) return {};
  return { document_briefing_enable: v };
}
