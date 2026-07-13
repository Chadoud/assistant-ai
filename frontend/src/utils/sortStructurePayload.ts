import type { AppSettings } from "../types/settings";
import type { SortStructureTemplate } from "../types/sortStructure";
import { sortStructureTemplateToApi } from "./sortStructureHydration";

/**
 * Optional field for analyze / sort job requests when the user has a structure template enabled.
 */
export function sortStructureTemplateRequestField(
  settings: AppSettings,
  override?: SortStructureTemplate | null
): { sort_structure_template?: Record<string, unknown> } {
  const tpl = override ?? settings.sortStructureTemplate;
  if (!tpl?.enabled || !tpl.modules.length) return {};
  return { sort_structure_template: sortStructureTemplateToApi(tpl) };
}
