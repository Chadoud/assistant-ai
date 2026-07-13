/** Built-in theme ids for sort structure templates. */
export type SortThemeId =
  | "auto"
  | "document_type"
  | "country"
  | "language"
  | "year"
  | "person"
  | "organization"
  | "property"
  | "project"
  | "work"
  | "custom";

export type OverflowPolicy = "merge_into_other" | "send_to_uncertain";

export interface SortStructureModule {
  id: string;
  theme: SortThemeId;
  customLabel?: string;
  maxFolders: number | null;
  overflowPolicy: OverflowPolicy;
  children: SortStructureModule[];
}

export interface SortStructureTemplate {
  version: 1;
  enabled: boolean;
  modules: SortStructureModule[];
}

export const DEFAULT_SORT_STRUCTURE_TEMPLATE: SortStructureTemplate = {
  version: 1,
  enabled: false,
  modules: [],
};

export function newSortStructureModule(partial?: Partial<SortStructureModule>): SortStructureModule {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `mod-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    theme: "document_type",
    maxFolders: null,
    overflowPolicy: "merge_into_other",
    children: [],
    ...partial,
  };
}

/** Max nesting depth (matches backend MAX_REL_DEST_SEGMENTS). */
export const SORT_STRUCTURE_MAX_DEPTH = 3;

export function sortStructureTreeDepth(modules: SortStructureModule[]): number {
  if (!modules.length) return 0;
  return Math.max(...modules.map(moduleDepth));
}

function moduleDepth(mod: SortStructureModule): number {
  if (!mod.children.length) return 1;
  return 1 + Math.max(...mod.children.map(moduleDepth));
}
