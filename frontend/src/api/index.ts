export {
  API_BASE,
  EntitlementBlockedError,
  type EntitlementStatus,
} from "./client";
export type { SortRequest, GmailAnalyzeSlice, DriveStreamStartRequest } from "./jobs";
export type {
  FileEntry,
  Job,
  FolderNode,
  HistoryEntry,
} from "./jobs";
export type { ModelStoragePartial, ModelStorageResponse } from "./models";

import { entitlementStatus, health, videoIngestMeta } from "./client";
import {
  gmailImportSort,
  gmailOAuthAbort,
  gmailOAuthBegin,
  gmailOAuthDisconnect,
  gmailStatus,
} from "./gmail";
import { jobsApi } from "./jobs";
import { modelsApi } from "./models";

export const api = {
  health,
  videoIngestMeta,
  entitlementStatus,
  gmailStatus,
  gmailOAuthBegin,
  gmailOAuthAbort,
  gmailOAuthDisconnect,
  gmailImportSort,
  ...modelsApi,
  ...jobsApi,
};
