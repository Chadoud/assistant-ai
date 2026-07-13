import type { Job } from "../api";
import type { AppSettings } from "../types/settings";
import type { SortStructureModule } from "../types/sortStructure";

/** True when job config includes an enabled structure template with at least one module. */
export function isSortStructureJobConfig(
  config: { sort_structure_template?: Record<string, unknown> | null } | null | undefined
): boolean {
  const tpl = config?.sort_structure_template as { enabled?: boolean; modules?: unknown[] } | undefined;
  return Boolean(tpl?.enabled && Array.isArray(tpl.modules) && tpl.modules.length > 0);
}

/** Modules from job config (preferred) or current settings for the running structure sort. */
export function resolveStructureModulesForActiveJob(
  job: Job | null | undefined,
  settings: AppSettings
): SortStructureModule[] {
  const jobTpl = job?.config?.sort_structure_template as { enabled?: boolean; modules?: SortStructureModule[] } | undefined;
  if (jobTpl?.enabled && Array.isArray(jobTpl.modules) && jobTpl.modules.length > 0) {
    return jobTpl.modules;
  }
  const settingsTpl = settings.sortStructureTemplate;
  if (settingsTpl?.enabled && settingsTpl.modules.length > 0) {
    return settingsTpl.modules;
  }
  return [];
}
