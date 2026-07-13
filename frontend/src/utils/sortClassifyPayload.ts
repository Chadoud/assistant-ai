import type { AppSettings } from "../types/settings";
import { resolveSortClassifyMode } from "./inferSortClassifyMode";
import { sortStructureTemplateRequestField } from "./sortStructurePayload";
import { sortSystemPromptRequestField } from "./sortSystemPromptPayload";

/**
 * Single source for sort classify fields on analyze / sort / voice-defaults requests.
 * Built-in mode omits both template and custom prompt.
 */
export function sortClassifyPayloadForJob(
  settings: AppSettings
): { sort_structure_template?: Record<string, unknown>; sort_system_prompt?: string } {
  const mode = resolveSortClassifyMode(settings);
  switch (mode) {
    case "structure":
      return sortStructureTemplateRequestField(settings);
    case "custom":
      return sortSystemPromptRequestField(settings);
    case "builtin":
    default:
      return {};
  }
}
