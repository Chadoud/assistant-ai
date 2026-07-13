import type {
  SortStructureModule,
  SortStructureTemplate,
  SortThemeId,
} from "../types/sortStructure";
import { SORT_STRUCTURE_MAX_DEPTH, sortStructureTreeDepth } from "../types/sortStructure";

const THEME_IDS: SortThemeId[] = [
  "auto",
  "document_type",
  "country",
  "language",
  "year",
  "person",
  "organization",
  "property",
  "project",
  "work",
  "custom",
];

function isThemeId(v: unknown): v is SortThemeId {
  return typeof v === "string" && (THEME_IDS as string[]).includes(v);
}

function parseModule(raw: unknown): SortStructureModule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return null;
  const theme = isThemeId(o.theme) ? o.theme : "document_type";
  const maxRaw = o.maxFolders ?? o.max_folders;
  const maxFolders =
    maxRaw === null || maxRaw === undefined
      ? null
      : typeof maxRaw === "number" && maxRaw >= 1
        ? Math.min(99, Math.floor(maxRaw))
        : null;
  const overflowRaw = o.overflowPolicy ?? o.overflow_policy;
  const overflowPolicy =
    overflowRaw === "send_to_uncertain" ? "send_to_uncertain" : "merge_into_other";
  const customLabel =
    typeof o.customLabel === "string"
      ? o.customLabel
      : typeof o.custom_label === "string"
        ? o.custom_label
        : undefined;
  const children = Array.isArray(o.children)
    ? o.children.map(parseModule).filter((m): m is SortStructureModule => m !== null)
    : [];
  return {
    id,
    theme,
    customLabel,
    maxFolders,
    overflowPolicy,
    children,
  };
}

/** Parse persisted or imported template JSON; returns null when invalid. */
export function parseSortStructureTemplate(raw: unknown): SortStructureTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const version = o.version === 1 ? 1 : null;
  if (version !== 1) return null;
  const modules = Array.isArray(o.modules)
    ? o.modules.map(parseModule).filter((m): m is SortStructureModule => m !== null)
    : [];
  if (sortStructureTreeDepth(modules) > SORT_STRUCTURE_MAX_DEPTH) return null;
  return {
    version: 1,
    enabled: Boolean(o.enabled),
    modules,
  };
}

/** Convert frontend module shape to API snake_case body. */
export function sortStructureTemplateToApi(
  tpl: SortStructureTemplate
): Record<string, unknown> {
  const mapModule = (m: SortStructureModule): Record<string, unknown> => ({
    id: m.id,
    theme: m.theme,
    custom_label: m.customLabel ?? null,
    max_folders: m.maxFolders,
    overflow_policy: m.overflowPolicy,
    children: m.children.map(mapModule),
  });
  return {
    version: tpl.version,
    enabled: tpl.enabled,
    modules: tpl.modules.map(mapModule),
  };
}
