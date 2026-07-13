/**
 * Types for the iCloud Drive workspace connector.
 *
 * iCloud is connect-only today (`renderWorkspaceBlock: null` in
 * `externalSources/connectors.tsx`), so only the prefs/props contracts live
 * here — the former sort-block UI was removed as unreachable code.
 */

import type { AppSettings } from "../../types/settings";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type ICloudMergePrefs = {
  enabled: boolean;
  typeCategories: WorkspaceFileTypeCategory[];
};

export interface ICloudWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onICloudMergePrefsChange: (prefs: ICloudMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}
