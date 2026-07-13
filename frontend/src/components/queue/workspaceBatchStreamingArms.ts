import type { DriveMergePrefs } from "../workspace/DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "../workspace/DropboxWorkspaceSortBlock";
import type { DropboxFileEntry } from "../workspace/dropboxWorkspaceListFilter";
import type { OneDriveMergePrefs } from "../workspace/oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "../workspace/outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "../workspace/s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "../workspace/slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "../workspace/icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "../workspace/infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "../workspace/InfomaniakMailWorkspaceSortBlock";
import {
  streamProgressiveDriveImportIdBatches,
  type ProgressiveDriveImportIdBatch,
} from "../workspace/driveWorkspaceImportResolve";
import {
  streamProgressiveDropboxImportBatches,
  type ProgressiveDropboxImportBatch,
} from "../workspace/dropboxWorkspaceImportResolve";
import {
  streamProgressiveOneDriveImportBatches,
  type ProgressiveOneDriveImportBatch,
} from "../workspace/oneDriveWorkspaceImportResolve";
import {
  streamProgressiveOutlookImportBatches,
  type ProgressiveOutlookImportBatch,
} from "../workspace/outlookWorkspaceImportResolve";
import {
  streamProgressiveS3ImportBatches,
  type ProgressiveS3ImportBatch,
} from "../workspace/s3WorkspaceImportResolve";
import {
  streamProgressiveSlackImportBatches,
  type ProgressiveSlackImportBatch,
} from "../workspace/slackWorkspaceImportResolve";
import {
  streamProgressiveICloudImportBatches,
  type ProgressiveICloudImportBatch,
} from "../workspace/icloudWorkspaceImportResolve";
import {
  streamProgressiveInfomaniakImportBatches,
  type ListInfomaniakFilesFn,
  type ProgressiveInfomaniakImportBatch,
} from "../workspace/infomaniakWorkspaceImportResolve";
import {
  streamProgressiveInfomaniakMailImportBatches,
  type ProgressiveInfomaniakMailImportBatch,
} from "../workspace/infomaniakMailWorkspaceImportResolve";
import type { ProviderAdapter } from "./runProgressiveCloudImportLoop";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

/** Progressive Google Drive import arm for workspace batch runs. */
export function buildDriveStreamingArm(
  prefs: DriveMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveDriveImportIdBatch> {
  return {
    batchStream: streamProgressiveDriveImportIdBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListGoogleDriveFiles!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileRowCount,
    }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportGoogleDriveFiles!({
        fileIds: batch.fileIds,
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    extraPostImportChunkFields: (_batch, failed) => {
      const failedIds = (failed as { id: string }[]).map((f) => f.id).filter(Boolean);
      return failedIds.length > 0
        ? { drive_fetch_failures: failedIds.length, drive_failed_file_ids: failedIds }
        : {};
    },
    toasts: {
      importFailed: t("queue.workspaceBatchDriveImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchDriveImportPartial", { count }),
    },
  };
}

/** Progressive Dropbox import arm. */
export function buildDropboxStreamingArm(
  prefs: DropboxMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveDropboxImportBatch> {
  return {
    batchStream: streamProgressiveDropboxImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListDropboxFiles!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({ listingDiscovered: batch.filteredFileCount }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportDropboxFiles!({
        entries: [batch.entry as Extract<DropboxFileEntry, { ".tag": "file" }>],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { path: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchDropboxImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchDropboxImportPartial", { count }),
    },
  };
}

/** Progressive OneDrive import arm. */
export function buildOneDriveStreamingArm(
  prefs: OneDriveMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveOneDriveImportBatch> {
  return {
    batchStream: streamProgressiveOneDriveImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListOneDriveFiles!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileCount,
    }),
    isListingCapped: (batch) => Boolean(batch.listingCapped),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportOneDriveFiles!({
        items: [batch.item],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchOneDriveImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchOneDriveImportPartial", { count }),
      listingCapped: t("queue.workspaceBatchOneDriveListingCapped"),
    },
  };
}

/** Progressive Outlook import arm. */
export function buildOutlookStreamingArm(
  prefs: OutlookMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveOutlookImportBatch> {
  return {
    batchStream: streamProgressiveOutlookImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListOutlookMessages!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({ listingDiscovered: batch.discoveredCount }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportOutlookMessages!({
        messageIds: [batch.message.id],
        messagesMeta: [batch.message],
        includeAttachments: prefs.includeAttachments ?? false,
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchOutlookImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchOutlookImportPartial", { count }),
    },
  };
}

/** Progressive Infomaniak Mail import arm. */
export function buildInfomaniakMailStreamingArm(
  prefs: InfomaniakMailMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveInfomaniakMailImportBatch> {
  return {
    batchStream: streamProgressiveInfomaniakMailImportBatches(
      prefs,
      (payload) =>
        window.electronAPI!.integrationListInfomaniakMailMessages!(
          payload,
        ) as Promise<{ ok: true; messages: Record<string, unknown>[] } | { ok: false; reason?: string }>,
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({ listingDiscovered: batch.discoveredCount }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportInfomaniakMailMessages!({
        messageIds: [batch.message.id],
        messagesMeta: [batch.message],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchInfomaniakMailImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchInfomaniakMailImportPartial", { count }),
    },
  };
}

/** Progressive S3 import arm. */
export function buildS3StreamingArm(
  prefs: S3MergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveS3ImportBatch> {
  return {
    batchStream: streamProgressiveS3ImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListS3Objects!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileCount,
    }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportS3Objects!({
        items: [batch.item],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { key: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchS3ImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchS3ImportPartial", { count }),
    },
  };
}

/** Progressive Slack import arm. */
export function buildSlackStreamingArm(
  prefs: SlackMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveSlackImportBatch> {
  return {
    batchStream: streamProgressiveSlackImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListSlackFiles!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileCount,
    }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportSlackFiles!({
        files: [batch.file],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchSlackImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchSlackImportPartial", { count }),
    },
  };
}

/** Progressive iCloud import arm. */
export function buildICloudStreamingArm(
  prefs: ICloudMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveICloudImportBatch> {
  return {
    batchStream: streamProgressiveICloudImportBatches(
      prefs,
      (payload) => window.electronAPI!.integrationListICloudFiles!(payload),
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileCount,
    }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportICloudFiles!({
        items: [batch.item],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { path: string; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchICloudImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchICloudImportPartial", { count }),
    },
  };
}

/** Progressive Infomaniak Drive import arm. */
export function buildInfomaniakStreamingArm(
  prefs: InfomaniakMergePrefs,
  t: TFunction,
  signal: AbortSignal,
): ProviderAdapter<ProgressiveInfomaniakImportBatch> {
  return {
    batchStream: streamProgressiveInfomaniakImportBatches(
      prefs,
      (payload) =>
        window.electronAPI!.integrationListInfomaniakFiles!(payload) as ReturnType<ListInfomaniakFilesFn>,
      { signal },
    ),
    getDiscoveredCounts: (batch) => ({
      listingDiscovered: batch.filteredFileCount,
      rawSourceCount: batch.discoveredFileCount,
    }),
    importBatch: (batch, stagingDir) =>
      window.electronAPI!.integrationImportInfomaniakFiles!({
        items: [batch.item],
        ...(stagingDir ? { stagingDir } : {}),
      }) as Promise<
        | { ok: true; localPaths: string[]; failed: { id: number; reason: string }[]; stagingDir: string }
        | { ok: false; reason?: string }
      >,
    toasts: {
      importFailed: t("queue.workspaceBatchInfomaniakImportFailed"),
      partialImport: (count) => t("queue.workspaceBatchInfomaniakImportPartial", { count }),
    },
  };
}
