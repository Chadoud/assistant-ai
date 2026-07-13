import type { AppSettings, SortClassifyMode } from "../../../types/settings";
import { buildSortStructureSummary } from "../../../utils/sortStructureSummaryText";
import { resolveSortClassifyMode } from "../../../utils/inferSortClassifyMode";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Plain-language one-line summary for the sort instructions strip.
 */
export function buildSortInstructionsSummary(settings: AppSettings, t: TranslateFn): string {
  const mode = resolveSortClassifyMode(settings);
  const parts: string[] = [];

  switch (mode) {
    case "structure": {
      const tpl = settings.sortStructureTemplate;
      if (tpl?.enabled && tpl.modules.length) {
        parts.push(buildSortStructureSummary(tpl.modules, t));
      } else {
        parts.push(t("sortInstructionsStrip.summaryStructure"));
      }
      break;
    }
    case "custom":
      parts.push(t("sortInstructionsStrip.summaryCustom"));
      break;
    case "builtin":
    default:
      parts.push(t("sortInstructionsStrip.summaryBuiltin"));
      break;
  }

  const activeRules = settings.rules.filter((r) => r.enabled && r.pattern.trim()).length;
  if (activeRules > 0) {
    parts.push(t("sortInstructionsStrip.summaryRules", { count: activeRules }));
  }

  return parts.join(" · ");
}

export function sortClassifyModeLabel(mode: SortClassifyMode, t: TranslateFn): string {
  switch (mode) {
    case "structure":
      return t("sortInstructionsStrip.modeStructure");
    case "custom":
      return t("sortInstructionsStrip.modeCustom");
    case "builtin":
    default:
      return t("sortInstructionsStrip.modeBuiltin");
  }
}
