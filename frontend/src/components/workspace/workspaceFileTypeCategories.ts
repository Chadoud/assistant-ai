/** Shared file-type dimensions for workspace filters (Drive, Dropbox, OneDrive). */

export type WorkspaceFileTypeCategory = "pdf" | "images" | "documents" | "spreadsheets" | "other";

export const WORKSPACE_FILE_TYPE_CATEGORY_ORDER: readonly WorkspaceFileTypeCategory[] = [
  "pdf",
  "images",
  "documents",
  "spreadsheets",
  "other",
] as const;

/** Default: every category selected (same behavior as legacy “All types”). */
export function defaultWorkspaceFileTypeCategories(): WorkspaceFileTypeCategory[] {
  return [...WORKSPACE_FILE_TYPE_CATEGORY_ORDER];
}

/**
 * Whether a file’s category passes the checkbox selection.
 * Empty selection matches no files.
 */
export function fileCategoryPassesWorkspaceTypeSelection(
  fileCategory: WorkspaceFileTypeCategory,
  selected: readonly WorkspaceFileTypeCategory[]
): boolean {
  if (selected.length === 0) return false;
  return new Set(selected).has(fileCategory);
}
