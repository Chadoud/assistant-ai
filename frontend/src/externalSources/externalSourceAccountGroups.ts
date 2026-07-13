import type { ExternalSourceId } from "./externalSourceIds";

/**
 * Groups External sources cards by vendor/product family for the External sources tab grid.
 * Order here defines section order on the page; connector order within a group matches UX priority.
 */
export const EXTERNAL_SOURCE_ACCOUNT_GROUPS: ReadonlyArray<{
  /** Stable id for keys / tests */
  groupId: string;
  /** i18n key under `sources` (e.g. `familyGoogle` → `t("sources.familyGoogle")`) */
  titleKey: string;
  connectorIds: readonly ExternalSourceId[];
}> = [
  {
    groupId: "google",
    titleKey: "familyGoogle",
    connectorIds: ["gmail", "google-drive", "google-calendar"],
  },
  {
    groupId: "messaging",
    titleKey: "familyMessaging",
    connectorIds: ["slack", "whatsapp"],
  },
  {
    groupId: "infomaniak",
    titleKey: "familyInfomaniak",
    connectorIds: ["infomaniak", "infomaniak-mail", "infomaniak-calendar"],
  },
  {
    groupId: "microsoft",
    titleKey: "familyMicrosoft",
    connectorIds: ["onedrive", "outlook"],
  },
  {
    groupId: "dropbox",
    titleKey: "familyDropbox",
    connectorIds: ["dropbox"],
  },
  {
    groupId: "notion",
    titleKey: "familyNotion",
    connectorIds: ["notion"],
  },
];
