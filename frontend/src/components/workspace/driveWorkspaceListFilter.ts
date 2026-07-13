/** Client-side filter/sort for Google Drive child listing in the workspace picker. */

import {
  fileCategoryPassesWorkspaceTypeSelection,
  type WorkspaceFileTypeCategory,
} from "./workspaceFileTypeCategories";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveListRow = {
  id: string;
  name: string;
  mimeType: string;
  /** RFC 3339 from Drive API */
  modifiedTime?: string;
};

export type DriveDateFilter = "any" | "7d" | "30d" | "since";
export type DriveSortOption = "name" | "modifiedDesc";

type FileCategory = WorkspaceFileTypeCategory;

/**
 * Returns milliseconds since epoch at local midnight for YYYY-MM-DD, or null if invalid.
 */
export function localDayStartMs(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const t = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * If non-null, files with modifiedTime strictly before this are hidden. Folders are always kept.
 */
export function modifiedNotBeforeMs(dateFilter: DriveDateFilter, sinceDateLocal: string): number | null {
  if (dateFilter === "any") return null;
  const now = Date.now();
  if (dateFilter === "7d") return now - 7 * 86400_000;
  if (dateFilter === "30d") return now - 30 * 86400_000;
  if (dateFilter === "since") return localDayStartMs(sinceDateLocal);
  return null;
}

function categorizeFileMime(mimeType: string): FileCategory {
  const m = mimeType || "";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "images";
  if (
    m === "application/vnd.google-apps.document" ||
    m.includes("wordprocessingml") ||
    m === "application/msword" ||
    m === "application/rtf" ||
    m === "text/plain" ||
    m === "text/markdown" ||
    m === "text/html"
  ) {
    return "documents";
  }
  if (
    m === "application/vnd.google-apps.spreadsheet" ||
    m.includes("spreadsheetml") ||
    m === "text/csv"
  ) {
    return "spreadsheets";
  }
  return "other";
}

function isFolder(mimeType: string): boolean {
  return mimeType === DRIVE_FOLDER_MIME;
}

export function rowPassesFilters(
  row: DriveListRow,
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: DriveDateFilter,
  sinceDateLocal: string
): boolean {
  if (isFolder(row.mimeType)) return true;

  const cat = categorizeFileMime(row.mimeType);
  if (!fileCategoryPassesWorkspaceTypeSelection(cat, typeCategories)) return false;

  const minMs = modifiedNotBeforeMs(dateFilter, sinceDateLocal);
  if (minMs == null) return true;
  if (!row.modifiedTime) return true;
  const t = new Date(row.modifiedTime).getTime();
  if (!Number.isFinite(t) || t < minMs) return false;
  return true;
}

export function filterAndSortDriveRows(
  items: DriveListRow[],
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: DriveDateFilter,
  sinceDateLocal: string,
  sort: DriveSortOption
): DriveListRow[] {
  const out = items.filter((row) => rowPassesFilters(row, typeCategories, dateFilter, sinceDateLocal));
  out.sort((a, b) => {
    const af = isFolder(a.mimeType);
    const bf = isFolder(b.mimeType);
    if (af !== bf) return af ? -1 : 1;
    if (sort === "name") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    const at = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
    const bt = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}
