/**
 * OneDrive workspace import resolver.
 *
 * One recursive listing in the desktop app (full tree from `path`, with caps), then filter/sort.
 * `filteredFileCount` on each batch matches Dropbox-style progressive import totals.
 */

import {
  filterAndSortOneDriveItems,
  type OneDriveDateFilter,
  type OneDriveFileItem,
  type OneDriveSortOption,
  type WorkspaceFileTypeCategory,
} from "./oneDriveWorkspaceListFilter";

export type OneDriveMergePrefs = {
  enabled: boolean;
  /** OneDrive folder path to list (empty string = root). */
  path: string;
  typeCategories: WorkspaceFileTypeCategory[];
  dateFilter: OneDriveDateFilter;
  sinceDate: string;
  sortOption: OneDriveSortOption;
};

export type { OneDriveFileItem };

export type ProgressiveOneDriveImportBatch = {
  /** The single item to download in this batch. */
  item: OneDriveFileItem;
  /** Count after filters + sort (stable once listing is complete). */
  filteredFileCount: number;
  /** Raw file rows from Graph before filters (stable once listing is complete). */
  discoveredFileCount: number;
  /** Recursive listing hit folder/file safety caps (same on every batch). */
  listingCapped?: boolean;
};

type ListOneDriveFilesFn = (payload: {
  path?: string;
  nextLink?: string;
  recursive?: boolean;
}) => Promise<
  | {
      ok: true;
      items: OneDriveFileItem[];
      nextLink?: string;
      cappedByFolders?: boolean;
      cappedByFiles?: boolean;
    }
  | { ok: false; reason?: string }
>;

/**
 * Yields one-item batches for progressive import.
 *
 * Phase 1: one recursive listing from the desktop app (entire tree from `path`, with safety caps).
 * Phase 2: yield one item per batch.
 *
 * `filteredFileCount` is set on every batch so the UI shows a stable total immediately.
 */
export async function* streamProgressiveOneDriveImportBatches(
  prefs: OneDriveMergePrefs,
  listFn: ListOneDriveFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveOneDriveImportBatch> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  const result = await listFn({ path: prefs.path, recursive: true });
  if (!result.ok) {
    console.error("[oneDriveImportResolve] recursive list failed:", result.reason);
    return;
  }

  if (signal?.aborted) return;

  const listingCapped = Boolean(result.cappedByFolders || result.cappedByFiles);
  const allItems = result.items;
  const discoveredFileCount = allItems.length;
  const filtered = filterAndSortOneDriveItems(
    allItems,
    prefs.typeCategories,
    prefs.dateFilter,
    prefs.sinceDate,
    prefs.sortOption
  );
  const filteredFileCount = filtered.length;

  // Phase 2: yield one item per batch.
  for (const item of filtered) {
    if (signal?.aborted) return;
    yield { item, filteredFileCount, discoveredFileCount, listingCapped };
  }
}
