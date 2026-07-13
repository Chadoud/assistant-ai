/**
 * Types for the Slack workspace connector.
 *
 * Slack is connect-only today (`renderWorkspaceBlock: null` in
 * `externalSources/connectors.tsx`), so only the prefs/props contracts live
 * here — the former sort-block UI was removed as unreachable code.
 */

import type { AppSettings } from "../../types/settings";
import type { WorkspaceFileTypeCategory } from "./workspaceFileTypeCategories";

export type SlackMergePrefs = {
  enabled: boolean;
  channelId: string;
  typeCategories: WorkspaceFileTypeCategory[];
};

export interface SlackWorkspaceSortBlockProps {
  settings: AppSettings;
  backendOnline: boolean;
  onSlackMergePrefsChange: (prefs: SlackMergePrefs | null) => void;
  onOpenExternalSourcesTab?: () => void;
  hideWorkspacePrimaryImportButton?: boolean;
}
