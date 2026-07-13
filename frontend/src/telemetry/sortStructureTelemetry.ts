import type { Job } from "../api";
import type { AppSettings } from "../types/settings";
import type { SortStructureModule, SortStructureTemplate } from "../types/sortStructure";
import { sortStructureTreeDepth } from "../types/sortStructure";
import { TelemetryEventNames } from "./schema";
import { track } from "./client";

/** Privacy-safe overflow bucket for cap telemetry (matches plan). */
export function overflowCountBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  return "21+";
}

function flattenThemes(modules: SortStructureModule[]): string[] {
  const out: string[] = [];
  for (const mod of modules) {
    out.push(mod.theme);
    if (mod.children.length) out.push(...flattenThemes(mod.children));
  }
  return out;
}

function templateHasCaps(modules: SortStructureModule[]): boolean {
  return modules.some(
    (mod) => mod.maxFolders != null || (mod.children.length > 0 && templateHasCaps(mod.children))
  );
}

/** Allowed telemetry props when a structure template is active on a job. */
export function sortStructureEnabledProps(
  tpl: SortStructureTemplate | null | undefined
): {
  structure_depth: number;
  structure_themes: string;
  has_structure_caps: boolean;
} | null {
  if (!tpl?.enabled || !tpl.modules.length) return null;
  return {
    structure_depth: sortStructureTreeDepth(tpl.modules),
    structure_themes: flattenThemes(tpl.modules).join(","),
    has_structure_caps: templateHasCaps(tpl.modules),
  };
}

export function trackSortStructureEnabled(
  optIn: boolean,
  locale: string,
  settings: AppSettings
): void {
  const props = sortStructureEnabledProps(settings.sortStructureTemplate);
  if (!props) return;
  track(optIn, locale, TelemetryEventNames.sortStructureEnabled, props);
}

export function trackSortStructurePackImported(
  optIn: boolean,
  locale: string,
  packId: string
): void {
  track(optIn, locale, TelemetryEventNames.sortStructurePackImported, {
    pack_id: packId.slice(0, 128),
  });
}

export function countStructureCapRewrites(job: Job): number {
  return (job.files ?? []).filter((f) => f.structure_cap_rewritten).length;
}

export function trackSortStructureCapAppliedIfNeeded(
  optIn: boolean,
  locale: string,
  job: Job
): void {
  const count = countStructureCapRewrites(job);
  if (count <= 0) return;
  track(optIn, locale, TelemetryEventNames.sortStructureCapApplied, {
    overflow_count_bucket: overflowCountBucket(count),
  });
}
