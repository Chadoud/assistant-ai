/** Client-side filter/sort for Microsoft OneDrive listings in the workspace run (Graph API items). */

import type { DriveDateFilter, DriveSortOption } from "./driveWorkspaceListFilter";
import { modifiedNotBeforeMs } from "./driveWorkspaceListFilter";
import {
  fileCategoryPassesWorkspaceTypeSelection,
  type WorkspaceFileTypeCategory,
} from "./workspaceFileTypeCategories";

export type { WorkspaceFileTypeCategory };

export type OneDriveFileItem = {
  id: string;
  name: string;
  size?: number;
  /** ISO 8601 from Graph API */
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
};

export type OneDriveDateFilter = DriveDateFilter;
export type OneDriveSortOption = DriveSortOption;

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

function categorizeByMime(mimeType: string): FileCategory {
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

function categorizeOneDriveItem(item: OneDriveFileItem): FileCategory {
  const mime = item.file?.mimeType?.trim();
  if (mime) {
    return categorizeByMime(mime);
  }
  return categorizeByExtension(item.name);
}

export function oneDriveItemPassesFilters(
  item: OneDriveFileItem,
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: OneDriveDateFilter,
  sinceDateLocal: string
): boolean {
  const cat = categorizeOneDriveItem(item);
  if (!fileCategoryPassesWorkspaceTypeSelection(cat, typeCategories)) return false;

  const minMs = modifiedNotBeforeMs(dateFilter, sinceDateLocal);
  if (minMs != null) {
    const ts = item.lastModifiedDateTime;
    if (!ts) return true;
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t) || t < minMs) return false;
  }

  return true;
}

export function filterAndSortOneDriveItems(
  items: OneDriveFileItem[],
  typeCategories: readonly WorkspaceFileTypeCategory[],
  dateFilter: OneDriveDateFilter,
  sinceDateLocal: string,
  sort: OneDriveSortOption
): OneDriveFileItem[] {
  const out = items.filter((item) =>
    oneDriveItemPassesFilters(item, typeCategories, dateFilter, sinceDateLocal)
  );
  out.sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    const at = a.lastModifiedDateTime ? new Date(a.lastModifiedDateTime).getTime() : 0;
    const bt = b.lastModifiedDateTime ? new Date(b.lastModifiedDateTime).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}
