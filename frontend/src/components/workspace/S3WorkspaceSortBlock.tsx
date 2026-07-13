/**
 * Types for the Amazon S3 workspace connector.
 *
 * S3 is connect-only today (`renderWorkspaceBlock: null` in
 * `externalSources/connectors.tsx`), so only the prefs/props contracts live
 * here — the former sort-block UI was removed as unreachable code.
 */

import type { AppSettings } from "../../types/settings";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type S3MergePrefs = {
  enabled: boolean;
  prefix: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export interface S3WorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onS3MergePrefsChange: (prefs: S3MergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}
