import type { SortClassifyMode } from "../../../types/settings";

type TranslateFn = (key: string) => string;

export const SORT_CLASSIFY_MODES: SortClassifyMode[] = ["builtin", "structure", "custom"];

export function sortClassifyModeOptionTitle(mode: SortClassifyMode, t: TranslateFn): string {
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

export function sortClassifyModeOptionDescription(mode: SortClassifyMode, t: TranslateFn): string {
  switch (mode) {
    case "structure":
      return t("sortInstructionsStrip.modeStructureDesc");
    case "custom":
      return t("sortInstructionsStrip.modeCustomDesc");
    case "builtin":
    default:
      return t("sortInstructionsStrip.modeBuiltinDesc");
  }
}
