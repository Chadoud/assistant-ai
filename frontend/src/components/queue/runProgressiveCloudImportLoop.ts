/**
 * Generic progressive cloud-import loop.
 *
 * All four cloud providers (Drive, Dropbox, OneDrive, Outlook) share the same
 * pipeline shape:
 *   1. Stream batches from the listing async-generator.
 *   2. For each batch, post a pre-import chunk to the backend (discovered counts).
 *   3. Download that batch to a local staging dir via IPC.
 *   4. Post the imported paths chunk to the backend.
 *   5. On abort/error — seal the job stream with ended:true and cancel the job.
 *
 * Callers supply provider-specific pieces through `ProviderAdapter<TBatch>`.
 */

import { api } from "../../api";
import { toast } from "sonner";

type DriveStreamChunkBody = Parameters<typeof api.postDriveStreamChunk>[1];

/** Provider-specific adapter passed to `runProgressiveCloudImportLoop`. */
export interface ProviderAdapter<TBatch> {
  /** Async generator that yields one-batch items from the cloud listing. */
  batchStream: AsyncIterable<TBatch>;

  /**
   * Extract discovery counts from a batch.
   * `listingDiscovered`: the count to send as `drive_listing_discovered`.
   * `rawSourceCount`: optional — sent as `drive_files_in_source` (Drive only).
   */
  getDiscoveredCounts(batch: TBatch): {
    listingDiscovered: number;
    rawSourceCount?: number;
  };

  /**
   * Called once on the first batch that signals the listing was capped.
   * Return `true` if this batch is capped.
   */
  isListingCapped?: (batch: TBatch) => boolean;

  /** Download this batch; returns local paths + staging dir. */
  importBatch(
    batch: TBatch,
    stagingDir: string | undefined
  ): Promise<{ ok: true; localPaths: string[]; failed: unknown[]; stagingDir: string } | { ok: false; reason?: string }>;

  /**
   * Extra fields to add to the pre-import chunk (e.g. Drive's `drive_files_in_source`).
   * Return an empty object when nothing extra is needed.
   */
  extraPreImportChunkFields?: (
    batch: TBatch
  ) => Partial<DriveStreamChunkBody>;

  /**
   * Extra fields to add to the post-import chunk (e.g. Drive's failure tracking fields).
   */
  extraPostImportChunkFields?: (
    batch: TBatch,
    failed: unknown[]
  ) => Partial<DriveStreamChunkBody>;

  /** i18n keys / messages for toasts. */
  toasts: {
    /** Shown when the entire import call fails (ok: false). */
    importFailed: string;
    /** Shown once after import finishes, with the total count of items that failed across all batches. */
    partialImport?: (count: number) => string;
    /** Shown when the listing was capped. */
    listingCapped?: string;
  };
}

/**
 * Run the progressive cloud import loop inside a job stream.
 *
 * Resolves when the stream ends (all batches imported + ended chunk posted).
 * The caller is responsible for aborting the `signal` on cancellation.
 *
 * @returns `"ok"` on normal completion, `"abort"` if the signal was aborted, or
 *          `"error"` if a non-abort error was thrown (after re-throwing).
 */
export async function runProgressiveCloudImportLoop<TBatch>(
  jobId: string,
  signal: AbortSignal,
  adapter: ProviderAdapter<TBatch>,
  opts?: { sealStream?: boolean },
): Promise<"ok" | "abort"> {
  const sealStream = opts?.sealStream !== false;
  let stagingDir: string | undefined;
  let lastDiscovered = 0;
  /** Partial download failures across all batches — one toast at the end with this total (avoids N duplicate toasts). */
  let totalPartialImportFailures = 0;
  // postTail keeps chunk POSTs in-order without blocking the download loop.
  let postTail: Promise<unknown> = Promise.resolve();
  let listingCapWarned = false;
  const iter = adapter.batchStream[Symbol.asyncIterator]();

  try {
    let iterResult = await iter.next();
    while (!iterResult.done) {
      const batch = iterResult.value;
      const nextIterPromise = iter.next();

      // Listing-cap toast (at most once).
      if (
        !listingCapWarned &&
        adapter.isListingCapped?.(batch) &&
        adapter.toasts.listingCapped
      ) {
        listingCapWarned = true;
        toast.message(adapter.toasts.listingCapped);
      }

      const { listingDiscovered, rawSourceCount } = adapter.getDiscoveredCounts(batch);
      lastDiscovered = listingDiscovered;
      const stagingBeforeImport = stagingDir;
      const extraPre = adapter.extraPreImportChunkFields?.(batch) ?? {};

      postTail = postTail.then(() =>
        api.postDriveStreamChunk(
          jobId,
          {
            file_paths: [],
            ended: false,
            drive_listing_discovered: listingDiscovered,
            ...(rawSourceCount != null ? { drive_files_in_source: rawSourceCount } : {}),
            browser_staging_dir: stagingBeforeImport,
            ...extraPre,
          },
          { signal }
        )
      );

      const dr = await adapter.importBatch(batch, stagingDir);

      if (signal.aborted) {
        await Promise.resolve(iter.return?.(undefined)).catch(() => {});
        break;
      }

      if (!dr.ok) {
        await postTail.catch(() => {});
        toast.error(adapter.toasts.importFailed, {
          description: (dr as { reason?: string }).reason ?? "",
        });
        void api.postDriveStreamChunk(jobId, { file_paths: [], ended: true });
        return "abort";
      }

      if (!stagingDir && dr.stagingDir) {
        stagingDir = dr.stagingDir;
      }

      const localPaths = (dr.localPaths ?? []).map((p: string) => p.trim()).filter(Boolean);
      const batchFailed = (dr.failed ?? []) as unknown[];

      if (batchFailed.length > 0) {
        totalPartialImportFailures += batchFailed.length;
      }

      const extraPost = adapter.extraPostImportChunkFields?.(batch, batchFailed) ?? {};

      postTail = postTail.then(() =>
        api.postDriveStreamChunk(
          jobId,
          {
            file_paths: localPaths,
            ended: false,
            drive_listing_discovered: lastDiscovered,
            ...(rawSourceCount != null ? { drive_files_in_source: rawSourceCount } : {}),
            browser_staging_dir: stagingDir,
            ...extraPost,
          },
          { signal }
        )
      );

      iterResult = await nextIterPromise;
    }

    if (signal.aborted) {
      await postTail.catch(() => {});
      return "abort";
    }

    await postTail;
    if (sealStream) {
      await api.postDriveStreamChunk(jobId, {
        file_paths: [],
        ended: true,
        drive_listing_discovered: lastDiscovered,
        browser_staging_dir: stagingDir,
      });
    }

    if (totalPartialImportFailures > 0 && adapter.toasts.partialImport) {
      toast.message(adapter.toasts.partialImport(totalPartialImportFailures));
    }

    return "ok";
  } catch (err) {
    if (!signal.aborted) {
      try {
        await api.postDriveStreamChunk(jobId, { file_paths: [], ended: true });
      } catch {
        // allow cancel / offline
      }
    }
    if (err instanceof Error && err.name === "AbortError") return "abort";
    throw err;
  } finally {
    if (signal.aborted && jobId) {
      await postTail.catch(() => {});
      try {
        await api.postDriveStreamChunk(jobId, {
          file_paths: [],
          ended: true,
          drive_listing_discovered: lastDiscovered,
          browser_staging_dir: stagingDir,
        });
      } catch {
        // may already be ended, job cancelled, or offline
      }
      try {
        await api.cancelJob(jobId);
      } catch {
        // may already be cancelled
      }
    }
  }
}
