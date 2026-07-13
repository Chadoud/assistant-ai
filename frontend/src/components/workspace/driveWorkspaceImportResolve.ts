import {
  WORKSPACE_CLOUD_RECURSE_MAX_FILES,
  WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS,
} from "../../constants";
import {
  DRIVE_FOLDER_MIME,
  filterAndSortDriveRows,
  type DriveListRow,
} from "./driveWorkspaceListFilter";
import { driveMergeDebug, isDriveMergeDebugOn } from "./driveMergeDebug";
import type { DriveMergePrefs } from "./DriveWorkspaceSortBlock";

/** Safety cap: max distinct folders to list (BFS), including the starting parent. */
const DRIVE_RECURSE_MAX_FOLDERS = WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS;

/** Safety cap: max non-folder rows to collect before filter/sort (avoids runaway memory). */
const DRIVE_RECURSE_MAX_FILE_ROWS = WORKSPACE_CLOUD_RECURSE_MAX_FILES;

type ListGoogleDriveFilesFn = (payload?: {
  pageSize?: number;
  pageToken?: string;
  parentId?: string;
  /** When true, Drive lists all non-folder files in My Drive (any depth); see Electron `listDriveFiles`. */
  flatMyDriveFiles?: boolean;
}) => Promise<
  | {
      ok: true;
      files: Array<{
        id?: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
      }>;
      nextPageToken?: string;
    }
  | { ok: false; reason?: string }
>;

type DriveMergeListStats = {
  listApiCalls: number;
  listApiMs: number;
  folderListings: number;
  bfsCappedByFolders: boolean;
  bfsCappedByFileRows: boolean;
  fileRowsBeforeFilter: number;
};

/**
 * Map API file entries to client rows. Used for both a single `files` page and
 * the recursive BFS in {@link listAllFileRowsDescendantOf}.
 */
function toDriveListRows(
  files: Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string }>
): DriveListRow[] {
  return (files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: String(f.id),
      name: String(f.name),
      mimeType: String(f.mimeType || ""),
      modifiedTime: typeof f.modifiedTime === "string" ? f.modifiedTime : undefined,
    }));
}

/**
 * Paginates a single `parentId` listing (one folder level). Honors {@link AbortSignal} between pages.
 */
async function listEntireParentFolder(
  listFn: ListGoogleDriveFilesFn,
  parentId: string,
  signal: AbortSignal | undefined,
  stats: DriveMergeListStats
): Promise<DriveListRow[]> {
  const out: DriveListRow[] = [];
  let pageToken: string | undefined;
  let pageIndex = 0;
  for (;;) {
    if (signal?.aborted) {
      driveMergeDebug("listEntireAborted", { parentId, pageIndex, rowsSoFar: out.length });
      return out;
    }
    const t0 = performance.now();
    const r = await listFn({
      parentId,
      pageSize: 100,
      pageToken,
    });
    stats.listApiCalls += 1;
    stats.listApiMs += Math.round(performance.now() - t0);
    if (!r.ok) {
      driveMergeDebug("listPageFailed", { parentId, pageIndex, reason: (r as { reason?: string }).reason });
      return out;
    }
    const batch = toDriveListRows(r.files || []);
    out.push(...batch);
    if (isDriveMergeDebugOn() && (pageIndex === 0 || batch.length > 0)) {
      driveMergeDebug("listPage", {
        parentId: parentId === "root" ? "root(MyDrive)" : parentId,
        pageIndex,
        fileRowsThisPage: batch.length,
        hasMore: Boolean(r.nextPageToken),
      });
    }
    const next = typeof r.nextPageToken === "string" && r.nextPageToken ? r.nextPageToken : undefined;
    if (!next) break;
    pageToken = next;
    pageIndex += 1;
  }
  return out;
}

/**
 * Paginates the flat My Drive file stream (non-folders only, any depth). Fewer round-trips than BFS from `root`.
 */
async function listAllFileRowsFlatMyDrive(
  listFn: ListGoogleDriveFilesFn,
  signal: AbortSignal | undefined,
  stats: DriveMergeListStats
): Promise<DriveListRow[]> {
  const out: DriveListRow[] = [];
  let pageToken: string | undefined;
  let pageIndex = 0;
  for (;;) {
    if (signal?.aborted) {
      driveMergeDebug("flatListAborted", { pageIndex, rowsSoFar: out.length });
      break;
    }
    if (out.length >= DRIVE_RECURSE_MAX_FILE_ROWS) {
      stats.bfsCappedByFileRows = true;
      break;
    }
    const t0 = performance.now();
    const r = await listFn({
      flatMyDriveFiles: true,
      pageSize: 100,
      pageToken,
    });
    stats.listApiCalls += 1;
    stats.listApiMs += Math.round(performance.now() - t0);
    if (!r.ok) {
      driveMergeDebug("flatListPageFailed", { pageIndex, reason: (r as { reason?: string }).reason });
      break;
    }
    const batch = toDriveListRows(r.files || []);
    for (const row of batch) {
      if (row.mimeType === DRIVE_FOLDER_MIME) continue;
      out.push(row);
      if (out.length >= DRIVE_RECURSE_MAX_FILE_ROWS) {
        stats.bfsCappedByFileRows = true;
        break;
      }
    }
    if (isDriveMergeDebugOn() && (pageIndex === 0 || batch.length > 0)) {
      driveMergeDebug("flatListPage", {
        pageIndex,
        fileRowsThisPage: batch.length,
        hasMore: Boolean(r.nextPageToken),
      });
    }
    if (stats.bfsCappedByFileRows) break;
    const next = typeof r.nextPageToken === "string" && r.nextPageToken ? r.nextPageToken : undefined;
    if (!next) break;
    pageToken = next;
    pageIndex += 1;
  }
  stats.fileRowsBeforeFilter = out.length;
  if (isDriveMergeDebugOn()) {
    driveMergeDebug("flatListSummary", {
      lastPageIndex: pageIndex,
      listApiCalls: stats.listApiCalls,
      listApiMs: stats.listApiMs,
      bfsCappedByFileRows: stats.bfsCappedByFileRows,
      fileRowsBeforeFilter: out.length,
    });
  }
  return out;
}

/**
 * Lists every file under ``startParentId`` by BFS: list each folder’s direct
 * children (all pages), enqueue unseen subfolders. Stops after
 * {@link DRIVE_RECURSE_MAX_FOLDERS} **folder listings** (API walks), or when
 * {@link DRIVE_RECURSE_MAX_FILE_ROWS} file rows are collected. If the walk hits
 * the folder cap, remaining queued folders are not listed (larger Drives are
 * partially scanned in breadth order).
 * Pass {@link AbortSignal} so **Cancel** stops further Drive API calls (e.g. user
 * cancels while the walk is in progress).
 */
export async function listAllFileRowsDescendantOf(
  listFn: ListGoogleDriveFilesFn,
  startParentId: string,
  signal?: AbortSignal,
  stats?: DriveMergeListStats
): Promise<DriveListRow[]> {
  const mergeStats: DriveMergeListStats = stats ?? {
    listApiCalls: 0,
    listApiMs: 0,
    folderListings: 0,
    bfsCappedByFolders: false,
    bfsCappedByFileRows: false,
    fileRowsBeforeFilter: 0,
  };

  const fileRows: DriveListRow[] = [];
  const start = String(startParentId).trim() || "root";
  const folderQueue: string[] = [start];
  const enqueuedFolderIds = new Set<string>([start]);
  let folderListings = 0;

  outer: while (folderQueue.length > 0) {
    if (signal?.aborted) {
      driveMergeDebug("bfsAborted", { folderListings, fileRowsSoFar: fileRows.length, queueSize: folderQueue.length });
      break;
    }
    if (folderListings >= DRIVE_RECURSE_MAX_FOLDERS) {
      mergeStats.bfsCappedByFolders = true;
      break;
    }
    if (fileRows.length >= DRIVE_RECURSE_MAX_FILE_ROWS) {
      mergeStats.bfsCappedByFileRows = true;
      break;
    }
    const parentId = folderQueue.shift() as string;
    folderListings += 1;
    mergeStats.folderListings = folderListings;

    const pageRows = await listEntireParentFolder(listFn, parentId, signal, mergeStats);
    if (signal?.aborted) break;

    for (const row of pageRows) {
      if (row.mimeType === DRIVE_FOLDER_MIME) {
        if (!enqueuedFolderIds.has(row.id)) {
          enqueuedFolderIds.add(row.id);
          folderQueue.push(row.id);
        }
      } else {
        fileRows.push(row);
        if (fileRows.length >= DRIVE_RECURSE_MAX_FILE_ROWS) {
          mergeStats.bfsCappedByFileRows = true;
          break outer;
        }
      }
    }
  }

  mergeStats.fileRowsBeforeFilter = fileRows.length;
  if (isDriveMergeDebugOn()) {
    driveMergeDebug("bfsSummary", {
      startParentId: start,
      folderListings,
      foldersInQueueNotListed: Math.max(0, folderQueue.length),
      bfsCappedByFolders: mergeStats.bfsCappedByFolders,
      bfsCappedByFileRows: mergeStats.bfsCappedByFileRows,
      fileRowsBeforeFilter: fileRows.length,
      listApiCalls: mergeStats.listApiCalls,
      listApiMs: mergeStats.listApiMs,
    });
  }
  return fileRows;
}

type ResolveDriveMergeOptions = {
  /** When aborted, returns [] (caller should treat as cancelled / no files). */
  signal?: AbortSignal;
};

/**
 * From **My Drive root** (`parentId` empty or `root`), lists files via one flat paginated Drive query
 * (non-folders at any depth). From a **subfolder id**, lists recursively by BFS within safety limits.
 * Then applies the same client-side filter and sort as the Drive workspace block, and returns at most
 * {@link DRIVE_IMPORT_MAX_FILES} file ids.
 */
export async function resolveDriveFileIdsForMerge(
  merge: DriveMergePrefs,
  listFn: ListGoogleDriveFilesFn,
  options?: ResolveDriveMergeOptions
): Promise<string[]> {
  if (options?.signal?.aborted) {
    driveMergeDebug("resolveAbortedBeforeStart", {});
    return [];
  }
  const stats: DriveMergeListStats = {
    listApiCalls: 0,
    listApiMs: 0,
    folderListings: 0,
    bfsCappedByFolders: false,
    bfsCappedByFileRows: false,
    fileRowsBeforeFilter: 0,
  };
  const t0 = performance.now();
  const parentId = String(merge.parentId ?? "").trim() || "root";
  if (isDriveMergeDebugOn()) {
    driveMergeDebug("resolveStart", {
      listMode: parentId === "root" ? "flatMyDriveFiles" : "bfsFromFolder",
      parentId,
      pageSize: 100,
      maxRowsBeforeFilter: DRIVE_RECURSE_MAX_FILE_ROWS,
      maxReturnedIds: DRIVE_RECURSE_MAX_FILE_ROWS,
    });
  }
  const allFiles =
    parentId === "root"
      ? await listAllFileRowsFlatMyDrive(listFn, options?.signal, stats)
      : await listAllFileRowsDescendantOf(listFn, parentId, options?.signal, stats);
  if (options?.signal?.aborted) {
    driveMergeDebug("resolveAbortedAfterList", { listMs: Math.round(performance.now() - t0) });
    return [];
  }
  const rows = filterAndSortDriveRows(
    allFiles,
    merge.typeCategories,
    merge.dateFilter,
    merge.sinceDate,
    merge.sortOption
  );
  const fileRows = rows.filter((row) => row.mimeType !== DRIVE_FOLDER_MIME);
  const ids = fileRows.map((f) => f.id);
  if (isDriveMergeDebugOn()) {
    const totalMs = Math.round(performance.now() - t0);
    driveMergeDebug("resolveDone", {
      totalMs,
      listMode: parentId === "root" ? "flatMyDriveFiles" : "bfsFromFolder",
      listApiCalls: stats.listApiCalls,
      listApiMs: stats.listApiMs,
      fileRowsAfterFilter: fileRows.length,
      idCountReturned: ids.length,
      typeCategories: merge.typeCategories,
      dateFilter: merge.dateFilter,
      parentId: merge.parentId,
    });
  }
  return ids;
}

type ListDriveInStepsYield = { newFileRows: DriveListRow[]; listComplete: boolean };

/**
 * Incremental file listing for merge: each yield adds more file rows to the “seen so far” set
 * (flat My Drive: one page at a time; subfolder: one folder listing at a time).
 * Filter/sort runs on the running accumulator; import batches use
 * {@link streamProgressiveDriveImportIdBatches} so the **top N** under the user’s sort can
 * change as more pages arrive (no fake “first 100 in API order” without a full list).
 */
async function* listDriveFileRowsInSteps(
  merge: DriveMergePrefs,
  listFn: ListGoogleDriveFilesFn,
  signal: AbortSignal | undefined,
  stats: DriveMergeListStats
): AsyncGenerator<ListDriveInStepsYield> {
  const startParent = String(merge.parentId ?? "").trim() || "root";

  if (startParent === "root") {
    let pageToken: string | undefined;
    for (;;) {
      if (signal?.aborted) {
        return;
      }
      if (stats.fileRowsBeforeFilter >= DRIVE_RECURSE_MAX_FILE_ROWS) {
        yield { newFileRows: [], listComplete: true };
        return;
      }
      const t0 = performance.now();
      const r = await listFn({ flatMyDriveFiles: true, pageSize: 100, pageToken });
      stats.listApiCalls += 1;
      stats.listApiMs += Math.round(performance.now() - t0);
      if (!r.ok) {
        yield { newFileRows: [], listComplete: true };
        return;
      }
      const batch = toDriveListRows(r.files || []);
      const newFileRows: DriveListRow[] = [];
      for (const row of batch) {
        if (row.mimeType === DRIVE_FOLDER_MIME) continue;
        newFileRows.push(row);
        if (stats.fileRowsBeforeFilter + newFileRows.length >= DRIVE_RECURSE_MAX_FILE_ROWS) {
          stats.bfsCappedByFileRows = true;
          break;
        }
      }
      stats.fileRowsBeforeFilter += newFileRows.length;
      const next = typeof r.nextPageToken === "string" && r.nextPageToken ? r.nextPageToken : undefined;
      driveMergeDebug("driveStreamListPage", {
        mode: "flatMyDriveFiles",
        newNonFolderRows: newFileRows.length,
        listComplete: !next,
        rowsAccumulated: stats.fileRowsBeforeFilter,
      });
      yield { newFileRows, listComplete: !next || stats.bfsCappedByFileRows };
      if (!next || stats.bfsCappedByFileRows) {
        return;
      }
      pageToken = next;
    }
  }

  const enqueuedFolderIds = new Set<string>([startParent]);
  const folderQueue: string[] = [startParent];
  let folderListings = 0;

  while (folderQueue.length > 0) {
    if (signal?.aborted) {
      return;
    }
    if (folderListings >= DRIVE_RECURSE_MAX_FOLDERS) {
      stats.bfsCappedByFolders = true;
      yield { newFileRows: [], listComplete: true };
      return;
    }
    if (stats.fileRowsBeforeFilter >= DRIVE_RECURSE_MAX_FILE_ROWS) {
      stats.bfsCappedByFileRows = true;
      yield { newFileRows: [], listComplete: true };
      return;
    }
    const parentId = folderQueue.shift() as string;
    folderListings += 1;
    const pageRows = await listEntireParentFolder(listFn, parentId, signal, stats);
    if (signal?.aborted) {
      return;
    }
    const newFileRows: DriveListRow[] = [];
    for (const row of pageRows) {
      if (row.mimeType === DRIVE_FOLDER_MIME) {
        if (!enqueuedFolderIds.has(row.id)) {
          enqueuedFolderIds.add(row.id);
          folderQueue.push(row.id);
        }
      } else {
        newFileRows.push(row);
        stats.fileRowsBeforeFilter += 1;
        if (stats.fileRowsBeforeFilter >= DRIVE_RECURSE_MAX_FILE_ROWS) {
          stats.bfsCappedByFileRows = true;
          break;
        }
      }
    }
    driveMergeDebug("driveStreamListFolder", {
      mode: "bfs",
      parentId: parentId === "root" ? "root" : parentId,
      newNonFolderRows: newFileRows.length,
      remainingFolders: folderQueue.length,
    });
    const isComplete = folderQueue.length === 0 || stats.bfsCappedByFileRows || stats.bfsCappedByFolders;
    yield { newFileRows, listComplete: isComplete };
    if (isComplete) {
      return;
    }
  }
  yield { newFileRows: [], listComplete: true };
}

export type ProgressiveDriveImportIdBatch = {
  fileIds: string[];
  /** Raw non-folder rows discovered so far (before filter/cap). */
  discoveredFileRowCount: number;
  /**
   * Files that pass the active filter+sort and fall within the import cap at this moment.
   * This is the accurate "total files being imported" count — use this for the TOTAL tile,
   * not ``discoveredFileRowCount`` which is the raw Drive scan count.
   */
  filteredFileCount: number;
};

/**
 * Yields file id batches to import.
 *
 * The full Drive listing is consumed eagerly before any download batch is yielded so that
 * `filteredFileCount` (and therefore the UI's TOTAL tile) reflects the true file count from
 * the very first batch — even when the Drive has multiple API pages.
 *
 * Listing a typical drive takes only a few seconds; that small upfront cost is negligible
 * compared with the per-file download time and removes all UI confusion about a changing total.
 */
export async function* streamProgressiveDriveImportIdBatches(
  merge: DriveMergePrefs,
  listFn: ListGoogleDriveFilesFn,
  options?: { signal?: AbortSignal }
): AsyncGenerator<ProgressiveDriveImportIdBatch> {
  const signal = options?.signal;
  const byId = new Map<string, DriveListRow>();
  const imported = new Set<string>();
  const stats: DriveMergeListStats = {
    listApiCalls: 0,
    listApiMs: 0,
    folderListings: 0,
    bfsCappedByFolders: false,
    bfsCappedByFileRows: false,
    fileRowsBeforeFilter: 0,
  };

  // Phase 1: collect every page from the Drive listing before yielding any download batch.
  for await (const step of listDriveFileRowsInSteps(merge, listFn, signal, stats)) {
    if (signal?.aborted) return;
    for (const row of step.newFileRows) {
      if (row.mimeType !== DRIVE_FOLDER_MIME) {
        byId.set(row.id, row);
      }
    }
    if (step.listComplete) break;
  }

  if (signal?.aborted) return;

  // Phase 2: apply filter/sort once on the complete set, then yield one-file batches.
  const rows = filterAndSortDriveRows(
    Array.from(byId.values()),
    merge.typeCategories,
    merge.dateFilter,
    merge.sinceDate,
    merge.sortOption
  );
  const allIds = rows
    .filter((r) => r.mimeType !== DRIVE_FOLDER_MIME)
    .map((f) => f.id);
  const filteredFileCount = allIds.length;
  const discoveredFileRowCount = byId.size;

  for (const id of allIds) {
    if (signal?.aborted) return;
    imported.add(id);
    yield { fileIds: [id], discoveredFileRowCount, filteredFileCount };
  }
}
