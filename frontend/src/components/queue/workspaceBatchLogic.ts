import type { GmailAnalyzeSlice } from "../../api";
import type { GmailMergePrefs } from "../workspace/GmailWorkspaceSortBlock";
import type { DriveMergePrefs } from "../workspace/DriveWorkspaceSortBlock";
import type { DropboxMergePrefs } from "../workspace/DropboxWorkspaceSortBlock";
import type { OneDriveMergePrefs } from "../workspace/oneDriveWorkspaceImportResolve";
import type { OutlookMergePrefs } from "../workspace/outlookWorkspaceImportResolve";
import type { S3MergePrefs } from "../workspace/s3WorkspaceImportResolve";
import type { SlackMergePrefs } from "../workspace/slackWorkspaceImportResolve";
import type { ICloudMergePrefs } from "../workspace/icloudWorkspaceImportResolve";
import type { InfomaniakMergePrefs } from "../workspace/infomaniakWorkspaceImportResolve";
import type { InfomaniakMailMergePrefs } from "../workspace/InfomaniakMailWorkspaceSortBlock";
import { GMAIL_QUERY_DEFAULT_INBOX } from "../../utils/gmailSearchCategories";
import { defaultWorkspaceFileTypeCategories } from "../workspace/workspaceFileTypeCategories";

/**
 * Build the Gmail slice for /analyze/with-sources from workspace merge prefs, or null.
 */
export function buildGmailAnalyzeSliceFromMerge(
  merge: GmailMergePrefs | null
): GmailAnalyzeSlice | null {
  if (!merge?.enabled) return null;
  return {
    gmail_query: merge.gmail_query.trim() || GMAIL_QUERY_DEFAULT_INBOX,
    max_messages: merge.max_messages,
    gmail_import_content: merge.gmail_import_content,
  };
}

export function isGmailMergeOn(merge: GmailMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isDriveMergeOn(merge: DriveMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export type WorkspaceVoiceBatchTrigger = {
  /** When true, reuse saved Drive filters or synthesize My Drive root defaults — no manual checkbox needed. */
  forceGoogleDrive?: boolean;
};

/**
 * Matches ``DriveWorkspaceSortBlock`` defaults (My Drive root, all categories) when the Sort UI Drive checkbox was never enabled.
 */
export function syntheticVoiceGoogleDriveMergePrefs(): DriveMergePrefs {
  return {
    enabled: true,
    parentId: "root",
    typeCategories: defaultWorkspaceFileTypeCategories(),
    dateFilter: "any",
    sinceDate: "",
    sortOption: "name",
  };
}

export function isDropboxMergeOn(merge: DropboxMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isOneDriveMergeOn(merge: OneDriveMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isOutlookMergeOn(merge: OutlookMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isS3MergeOn(merge: S3MergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isSlackMergeOn(merge: SlackMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isICloudMergeOn(merge: ICloudMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isInfomaniakMergeOn(merge: InfomaniakMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function isInfomaniakMailMergeOn(merge: InfomaniakMailMergePrefs | null): boolean {
  return Boolean(merge?.enabled);
}

export function wantsStagedLocal(includeLocalInRun: boolean, stagedPathsLength: number): boolean {
  return includeLocalInRun && stagedPathsLength > 0;
}

/**
 * Merges local staged paths with paths returned from Drive import.
 */
export function buildJobFilePaths(
  wantsLocal: boolean,
  stagedPaths: string[],
  importedDrivePaths: string[]
): string[] {
  const all = [...(wantsLocal ? stagedPaths : []), ...importedDrivePaths];
  const normalized = new Set(all.map((p) => p.toLowerCase()));
  return all.filter((p) => {
    const lower = p.toLowerCase();
    if (!lower.endsWith(".video_thumb.jpg")) return true;
    const parentVideoPrefix = lower.slice(0, -".video_thumb.jpg".length);
    // Google/third-party exports often include thumbnail artifacts next to videos.
    // Skip them from analysis when the real video file is present.
    return !(
      normalized.has(`${parentVideoPrefix}.mp4`) ||
      normalized.has(`${parentVideoPrefix}.mov`) ||
      normalized.has(`${parentVideoPrefix}.m4v`) ||
      normalized.has(`${parentVideoPrefix}.webm`) ||
      normalized.has(`${parentVideoPrefix}.mkv`)
    );
  });
}

export function computeWorkspaceBatchButtonDisabled(input: {
  sortInputDisabled: boolean;
  workspaceBatchStarting: boolean;
  includeLocalInRun: boolean;
  stagedPathsLength: number;
  gmailMergeEnabled: boolean;
  driveMergeEnabled: boolean;
  dropboxMergeEnabled?: boolean;
  oneDriveMergeEnabled?: boolean;
  outlookMergeEnabled?: boolean;
  s3MergeEnabled?: boolean;
  slackMergeEnabled?: boolean;
  icloudMergeEnabled?: boolean;
  infomaniakMergeEnabled?: boolean;
  infomaniakMailMergeEnabled?: boolean;
}): boolean {
  return (
    input.sortInputDisabled ||
    input.workspaceBatchStarting ||
    ((!input.includeLocalInRun || input.stagedPathsLength === 0) &&
      !input.gmailMergeEnabled &&
      !input.driveMergeEnabled &&
      !input.dropboxMergeEnabled &&
      !input.oneDriveMergeEnabled &&
      !input.outlookMergeEnabled &&
      !input.s3MergeEnabled &&
      !input.slackMergeEnabled &&
      !input.icloudMergeEnabled &&
      !input.infomaniakMergeEnabled &&
      !input.infomaniakMailMergeEnabled)
  );
}

/**
 * i18n keys for the 8s “still working” line during workspace prep. One place to
 * map batch sources (Gmail, Drive, local) to user-facing copy — avoids mail-specific
 * text when the run is Drive- or file-only.
 */
export const WORKSPACE_PREP_STALL_MESSAGE = {
  drive: "queue.workspacePrepStallDrive",
  local: "queue.workspacePrepStallLocal",
  mail: "queue.workspacePrepStallMail",
  mixed: "queue.workspacePrepStallMixed",
  default: "queue.workspacePrepStallDefault",
  /** After ~8s while “Sending…” before a job exists (drop / browser upload path). */
  sending: "queue.workspacePrepStallSending",
} as const;

export type WorkspacePrepStallMessageKey = (typeof WORKSPACE_PREP_STALL_MESSAGE)[keyof typeof WORKSPACE_PREP_STALL_MESSAGE];

/**
 * Picks the prep stall subcopy for **workspace Run** based on which sources are in the batch.
 * Multiple sources → `mixed` (not misleading).
 */
export function resolveWorkspacePrepStallMessageKey(input: {
  gmailOn: boolean;
  driveOn: boolean;
  dropboxOn?: boolean;
  oneDriveOn?: boolean;
  outlookOn?: boolean;
  s3On?: boolean;
  slackOn?: boolean;
  icloudOn?: boolean;
  infomaniakOn?: boolean;
  infomaniakMailOn?: boolean;
  wantsLocal: boolean;
}): WorkspacePrepStallMessageKey {
  const cloudOn =
    input.driveOn ||
    Boolean(input.dropboxOn) ||
    Boolean(input.oneDriveOn) ||
    Boolean(input.outlookOn) ||
    Boolean(input.s3On) ||
    Boolean(input.slackOn) ||
    Boolean(input.icloudOn) ||
    Boolean(input.infomaniakOn) ||
    Boolean(input.infomaniakMailOn);
  const n =
    (input.gmailOn ? 1 : 0) + (cloudOn ? 1 : 0) + (input.wantsLocal ? 1 : 0);
  if (n > 1) return WORKSPACE_PREP_STALL_MESSAGE.mixed;
  if (cloudOn) return WORKSPACE_PREP_STALL_MESSAGE.drive;
  if (input.wantsLocal) return WORKSPACE_PREP_STALL_MESSAGE.local;
  if (input.gmailOn) return WORKSPACE_PREP_STALL_MESSAGE.mail;
  return WORKSPACE_PREP_STALL_MESSAGE.default;
}
