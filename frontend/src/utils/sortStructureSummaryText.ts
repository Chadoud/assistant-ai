import type { SortStructureModule, SortThemeId } from "../types/sortStructure";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

const THEME_I18N: Record<SortThemeId, string> = {
  auto: "settings.sortStructure.themeAuto",
  document_type: "settings.sortStructure.themeDocumentType",
  country: "settings.sortStructure.themeCountry",
  language: "settings.sortStructure.themeLanguage",
  year: "settings.sortStructure.themeYear",
  person: "settings.sortStructure.themePerson",
  organization: "settings.sortStructure.themeOrganization",
  property: "settings.sortStructure.themeProperty",
  project: "settings.sortStructure.themeProject",
  work: "settings.sortStructure.themeWork",
  custom: "settings.sortStructure.themeCustom",
};

export function themeLabel(theme: SortThemeId, t: TranslateFn, customLabel?: string): string {
  if (theme === "custom" && customLabel?.trim()) return customLabel.trim();
  return t(THEME_I18N[theme]);
}

/** Plain-language summary of the template for the settings UI. */
export function buildSortStructureSummary(
  modules: SortStructureModule[],
  t: TranslateFn,
  options?: { showCaps?: boolean }
): string {
  if (!modules.length) return t("settings.sortStructure.summaryEmpty");
  const showCaps = options?.showCaps ?? false;
  const parts: string[] = [];

  const walk = (mods: SortStructureModule[], depth: number) => {
    for (const mod of mods) {
      const label = themeLabel(mod.theme, t, mod.customLabel);
      if (showCaps && mod.maxFolders != null && mod.theme !== "auto") {
        parts.push(t("settings.sortStructure.summaryLevelCapped", { label, max: mod.maxFolders }));
      } else {
        parts.push(label);
      }
      if (mod.children.length) walk(mod.children, depth + 1);
    }
  };
  walk(modules, 0);

  if (parts.length === 1) {
    return t("settings.sortStructure.summarySingle", { level: parts[0] });
  }
  return t("settings.sortStructure.summaryNested", {
    outer: parts[0],
    inner: parts.slice(1).join(", "),
  });
}
