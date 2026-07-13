import type { SortStructureTemplate } from "../types/sortStructure";
import { parseSortStructureTemplate } from "./sortStructureHydration";

interface StructurePackFile {
  id?: string;
  version?: number | string;
  name?: string;
  template?: unknown;
}

/** Parse uploaded or fetched structure pack JSON. */
export function parseStructurePackJson(raw: unknown): SortStructureTemplate {
  if (!raw || typeof raw !== "object") throw new Error("Structure pack must be a JSON object.");
  const o = raw as StructurePackFile;
  const tpl = parseSortStructureTemplate(o.template);
  if (!tpl) throw new Error('Structure pack must include a valid "template" object.');
  return { ...tpl, enabled: true };
}
