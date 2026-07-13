import type { ExternalSourceId } from "./externalSourceIds";

/**
 * Sort files → external connectors (below “This computer”).
 * Sections group mail vs cloud file sources; {@link EXTERNAL_SOURCE_CONNECTORS} order stays canonical for registration.
 */
export const WORKSPACE_SORT_SOURCE_GROUPS: ReadonlyArray<{
  readonly groupId: "email" | "cloud_storage";
  /** queue.* i18n */
  readonly titleKey: string;
  readonly connectorIds: readonly ExternalSourceId[];
}> = [
  {
    groupId: "email",
    titleKey: "queue.workspaceGroupEmail",
    connectorIds: ["gmail", "outlook", "infomaniak-mail"],
  },
  {
    groupId: "cloud_storage",
    titleKey: "queue.workspaceGroupCloudStorage",
    connectorIds: ["google-drive", "infomaniak", "dropbox", "onedrive"],
  },
] as const;

/** Connector ids claimed by {@link WORKSPACE_SORT_SOURCE_GROUPS} (ungrouped blocks render afterward). */
export const WORKSPACE_SORT_GROUPED_CONNECTOR_IDS: ReadonlySet<ExternalSourceId> = new Set(
  WORKSPACE_SORT_SOURCE_GROUPS.flatMap((g) => [...g.connectorIds]),
);
