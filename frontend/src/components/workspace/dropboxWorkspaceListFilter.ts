/** Client-side filter/sort for Dropbox file listings in the workspace picker. */

import {
  fileCategoryPassesWorkspaceTypeSelection,
  type WorkspaceFileTypeCategory,
} from "./workspaceFileTypeCategories";

export type { WorkspaceFileTypeCategory };

export type DropboxFileEntry = {
  ".tag": "file" | "folder" | "deleted";
  id?: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
  /** ISO 8601 (UTC) from Dropbox API */
  client_modified?: string;
  server_modified?: string;
};

export type DropboxDateFilter = "any" | "7d" | "30d" | "since";
export type DropboxSortOption = "name" | "modifiedDesc";

type FileCategory = WorkspaceFileTypeCategory;

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function categorizeByExtension(name: string): FileCategory {
  const ext = extOf(name);
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg", "heic", "heif"].includes(ext))
    return "images";
  if (["doc", "docx", "odt", "rtf", "txt", "md", "html", "htm", "pages"].includes(ext))
    return "documents";
  if (["xls", "xlsx", "ods", "csv", "numbers"].includes(ext)) return "spreadsheets";
  return "other";
}

function localDayStartMs(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const t = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

function modifiedNotBeforeMs(dateFilter: DropboxDateFilter, sinceDateLocal: string): number | null {
  if (dateFilter === "any") return null;
  const now = Date.now();
  if (dateFilter === "7d") return now - 7 * 86400_000;
  if (dateFilter === "30d") return now - 30 * 86400_000;
  if (dateFilter === "since") return localDayStartMs(sinceDateLocal);
  return null;
}

function entryPassesFilters(
  entry: DropboxFileEntry,
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: DropboxDateFilter,
  sinceDateLocal: string
): boolean {
  if (entry[".tag"] !== "file") return false;

  const cat = categorizeByExtension(entry.name);
  if (!fileCategoryPassesWorkspaceTypeSelection(cat, typeCategories)) return false;

  const minMs = modifiedNotBeforeMs(dateFilter, sinceDateLocal);
  if (minMs != null) {
    const ts = entry.server_modified ?? entry.client_modified;
    if (!ts) return true;
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t) || t < minMs) return false;
  }

  return true;
}

export function filterAndSortDropboxEntries(
  entries: DropboxFileEntry[],
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: DropboxDateFilter,
  sinceDateLocal: string,
  sort: DropboxSortOption
): DropboxFileEntry[] {
  const out = entries.filter((e) => entryPassesFilters(e, typeCategories, dateFilter, sinceDateLocal));
  out.sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    const aTs = a.server_modified ?? a.client_modified;
    const bTs = b.server_modified ?? b.client_modified;
    const at = aTs ? new Date(aTs).getTime() : 0;
    const bt = bTs ? new Date(bTs).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}
