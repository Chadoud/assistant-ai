import type { SortJobSourceId } from "./deriveSortJobSources";
import {
  isDriveMergeOn,
  isDropboxMergeOn,
  isGmailMergeOn,
  isICloudMergeOn,
  isInfomaniakMailMergeOn,
  isInfomaniakMergeOn,
  isOneDriveMergeOn,
  isOutlookMergeOn,
  isS3MergeOn,
  isSlackMergeOn,
  wantsStagedLocal,
  type WorkspaceVoiceBatchTrigger,
} from "./workspaceBatchLogic";
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
import { syntheticVoiceGoogleDriveMergePrefs } from "./workspaceBatchLogic";

/** Ordered source ids for a workspace batch run (persisted on the job for UI chips). */
export function buildWorkspaceImportSources(opts: {
  includeLocalInRun: boolean;
  stagedPathCount: number;
  gmailMergePrefsSnapshot: GmailMergePrefs | null;
  driveMergePrefsSnapshot: DriveMergePrefs | null;
  dropboxMergePrefsSnapshot: DropboxMergePrefs | null;
  oneDriveMergePrefsSnapshot: OneDriveMergePrefs | null;
  outlookMergePrefsSnapshot: OutlookMergePrefs | null;
  s3MergePrefsSnapshot: S3MergePrefs | null;
  slackMergePrefsSnapshot: SlackMergePrefs | null;
  icloudMergePrefsSnapshot: ICloudMergePrefs | null;
  infomaniakMergePrefsSnapshot: InfomaniakMergePrefs | null;
  infomaniakMailMergePrefsSnapshot: InfomaniakMailMergePrefs | null;
  voiceTrigger?: WorkspaceVoiceBatchTrigger;
}): SortJobSourceId[] {
  const {
    includeLocalInRun,
    stagedPathCount,
    gmailMergePrefsSnapshot,
    driveMergePrefsSnapshot,
    dropboxMergePrefsSnapshot,
    oneDriveMergePrefsSnapshot,
    outlookMergePrefsSnapshot,
    s3MergePrefsSnapshot,
    slackMergePrefsSnapshot,
    icloudMergePrefsSnapshot,
    infomaniakMergePrefsSnapshot,
    infomaniakMailMergePrefsSnapshot,
    voiceTrigger,
  } = opts;

  const effectiveDriveMergePrefs: DriveMergePrefs | null =
    voiceTrigger?.forceGoogleDrive &&
    !(driveMergePrefsSnapshot && isDriveMergeOn(driveMergePrefsSnapshot))
      ? syntheticVoiceGoogleDriveMergePrefs()
      : driveMergePrefsSnapshot;

  const out: SortJobSourceId[] = [];
  if (wantsStagedLocal(includeLocalInRun, stagedPathCount)) out.push("local");
  if (isGmailMergeOn(gmailMergePrefsSnapshot)) out.push("gmail");
  if (isDriveMergeOn(effectiveDriveMergePrefs)) out.push("google-drive");
  if (isDropboxMergeOn(dropboxMergePrefsSnapshot)) out.push("dropbox");
  if (isOneDriveMergeOn(oneDriveMergePrefsSnapshot)) out.push("onedrive");
  if (isOutlookMergeOn(outlookMergePrefsSnapshot)) out.push("outlook");
  if (isS3MergeOn(s3MergePrefsSnapshot)) out.push("s3");
  if (isSlackMergeOn(slackMergePrefsSnapshot)) out.push("slack");
  if (isICloudMergeOn(icloudMergePrefsSnapshot)) out.push("icloud");
  if (isInfomaniakMergeOn(infomaniakMergePrefsSnapshot)) out.push("infomaniak");
  if (isInfomaniakMailMergeOn(infomaniakMailMergePrefsSnapshot)) out.push("infomaniak-mail");
  return out;
}
