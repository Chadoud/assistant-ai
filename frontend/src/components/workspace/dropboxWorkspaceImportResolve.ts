/**
 * Dropbox workspace import resolver.
 *
 * Eagerly collects all pages of a Dropbox listing (recursive from root) before yielding any
 * download batches — same pattern as Drive — so `filteredFileCount` (and the UI TOTAL tile)
 * is accurate from the very first yielded batch.
 */

import {
  filterAndSortDropboxEntries,
  type DropboxDateFilter,
  type DropboxFileEntry,
  type DropboxSortOption,
  type WorkspaceFileTypeCategory,
} from "./dropboxWorkspaceListFilter";

type DropboxMergePrefs = {
  enabled: boolean;
  /** Dropbox path to list (empty string = root). */
  path: string;
  typeCategories: WorkspaceFileTypeCategory[];
  dateFilter: DropboxDateFilter;
  sinceDate: string;
  sortOption: DropboxSortOption;
};

export type ProgressiveDropboxImportBatch = {
  /** The single file entry to download in this batch. */
  entry: DropboxFileEntry;
  /** Total filtered file count (stable for the life of the generator). */
  filteredFileCount: number;
  /** Raw file count discovered before filters (stable). */
  discoveredFileCount: number;
};

type ListDropboxFilesFn = (payload: {
  path?: string;
  cursor?: string;
  recursive?: boolean;
}) => Promise<
  | { ok: true; entries: DropboxFileEntry[]; cursor: string; hasMore: boolean }
  | { ok: false; reason?: string }
>;

/**
 * Yields one-file batches for progressive import.
 *
 * Phase 1: collect all pages from the Dropbox listing API.
 * Phase 2: filter + sort once, then yield one entry per batch.
 *
 * `filteredFileCount` is set on every batch so the UI can show a stable total immediately.
 */
export async function* streamProgressiveDropboxImportBatches(
  prefs: DropboxMergePrefs,
  listFn: ListDropboxFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveDropboxImportBatch> {
  const signal = options?.signal;
  const allEntries: DropboxFileEntry[] = [];

  // Phase 1: list all pages eagerly.
  let cursor: string | undefined;
  for (;;) {
    if (signal?.aborted) return;
    const result = await listFn({ path: prefs.path, cursor, recursive: true });
    if (!result.ok) {
      console.error("[dropboxImportResolve] list page failed:", result.reason);
      break;
    }
    for (const entry of result.entries) {
      if (entry[".tag"] === "file") {
        allEntries.push(entry);
      }
    }
    if (!result.hasMore) break;
    cursor = result.cursor;
  }

  if (signal?.aborted) return;

  // Phase 2: filter + sort.
  const filtered = filterAndSortDropboxEntries(
    allEntries,
    prefs.typeCategories,
    prefs.dateFilter,
    prefs.sinceDate,
    prefs.sortOption
  );

  const filteredFileCount = filtered.length;
  const discoveredFileCount = allEntries.length;

  for (const entry of filtered) {
    if (signal?.aborted) return;
    yield { entry, filteredFileCount, discoveredFileCount };
  }
}
