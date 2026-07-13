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
} from "./workspaceBatchLogic";

export type SelectedSourceSummary = {
  id: string;
  label: string;
  count?: number;
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type BuildSelectedSourcesSummaryInput = {
  t: TranslateFn;
  includeLocalInRun: boolean;
  stagedPathsLength: number;
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
};

/** Read-only chips for the wizard review step — mirrors workspace batch source gates. */
export function buildSelectedSourcesSummary(input: BuildSelectedSourcesSummaryInput): SelectedSourceSummary[] {
  const items: SelectedSourceSummary[] = [];

  if (wantsStagedLocal(input.includeLocalInRun, input.stagedPathsLength)) {
    items.push({
      id: "local",
      label: input.t("queue.workspaceLocalHeading"),
      count: input.stagedPathsLength,
    });
  }
  if (isGmailMergeOn(input.gmailMergePrefsSnapshot)) {
    items.push({ id: "gmail", label: input.t("sources.gmailTitle") });
  }
  if (isDriveMergeOn(input.driveMergePrefsSnapshot)) {
    items.push({ id: "drive", label: input.t("sources.driveTitle") });
  }
  if (isDropboxMergeOn(input.dropboxMergePrefsSnapshot)) {
    items.push({ id: "dropbox", label: input.t("sources.dropboxTitle") });
  }
  if (isOneDriveMergeOn(input.oneDriveMergePrefsSnapshot)) {
    items.push({ id: "onedrive", label: input.t("sources.oneDriveTitle") });
  }
  if (isOutlookMergeOn(input.outlookMergePrefsSnapshot)) {
    items.push({ id: "outlook", label: input.t("sources.outlookTitle") });
  }
  if (isS3MergeOn(input.s3MergePrefsSnapshot)) {
    items.push({ id: "s3", label: input.t("sources.s3Title") });
  }
  if (isSlackMergeOn(input.slackMergePrefsSnapshot)) {
    items.push({ id: "slack", label: input.t("sources.slackTitle") });
  }
  if (isICloudMergeOn(input.icloudMergePrefsSnapshot)) {
    items.push({ id: "icloud", label: input.t("sources.icloudTitle") });
  }
  if (isInfomaniakMergeOn(input.infomaniakMergePrefsSnapshot)) {
    items.push({ id: "infomaniak", label: input.t("sources.infomaniakTitle") });
  }
  if (isInfomaniakMailMergeOn(input.infomaniakMailMergePrefsSnapshot)) {
    items.push({ id: "infomaniak-mail", label: input.t("sources.infomaniakMailTitle") });
  }

  return items;
}
