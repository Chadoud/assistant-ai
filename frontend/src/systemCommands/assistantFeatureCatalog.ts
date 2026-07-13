import type { SystemCommandIdV1 } from "./catalog";
import type { AssistantIntegrationProviderKey } from "./catalog/types";
import { SYSTEM_COMMAND_CATALOG } from "./catalog";
import {
  ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED,
  isAssistantToolInstalledForCatalog,
  toggleAssistantCatalogToolInstall,
} from "./assistantToolCatalogUi";

/** User-facing capability ids — one toggle covers all linked provider commands. */
export type AssistantFeatureId =
  | "emailSearch"
  | "calendarEvents"
  | "cloudUpload"
  | "localFiles"
  | "apps"
  | "inAppNavigation"
  | "memory"
  | "webMedia"
  | "remindersSystem"
  | "deviceAdvanced";

export type AssistantFeatureUiSectionKey = "connected" | "localAndApps" | "assistant" | "device";

export type AssistantFeatureDefinition = {
  readonly id: AssistantFeatureId;
  readonly commandIds: readonly SystemCommandIdV1[];
  readonly providers?: readonly AssistantIntegrationProviderKey[];
};

/** Outcome-first capabilities; every catalog command appears exactly once. */
export const ASSISTANT_FEATURE_DEFINITIONS: readonly AssistantFeatureDefinition[] = [
  {
    id: "emailSearch",
    commandIds: ["gmail_search_messages", "graph_mail_search"],
    providers: ["google", "microsoft"],
  },
  {
    id: "calendarEvents",
    commandIds: [
      "google_calendar_list_events",
      "graph_calendar_list_events",
      "infomaniak_calendar_list_events",
    ],
    providers: ["google", "microsoft", "infomaniak"],
  },
  {
    id: "cloudUpload",
    commandIds: ["google_drive_upload_text", "graph_onedrive_upload_text"],
    providers: ["google", "microsoft"],
  },
  {
    id: "localFiles",
    commandIds: ["open_output_folder", "open_workspace_folder", "save_text_file"],
  },
  {
    id: "apps",
    commandIds: ["open_application", "open_app", "close_app"],
  },
  {
    id: "inAppNavigation",
    commandIds: ["navigate_tab", "open_help", "open_tour", "restart_backend"],
  },
  { id: "memory", commandIds: ["save_memory"] },
  {
    id: "webMedia",
    commandIds: ["web_search", "browser_control", "youtube_video"],
  },
  {
    id: "remindersSystem",
    commandIds: ["reminder", "computer_settings", "system_volume"],
  },
  {
    id: "deviceAdvanced",
    commandIds: ["list_directory", "terminal_safe", "get_running_apps", "read_file"],
  },
] as const;

export const ASSISTANT_FEATURE_UI_SECTIONS: readonly {
  sectionKey: AssistantFeatureUiSectionKey;
  featureIds: readonly AssistantFeatureId[];
}[] = [
  {
    sectionKey: "connected",
    featureIds: ["emailSearch", "calendarEvents", "cloudUpload"],
  },
  {
    sectionKey: "localAndApps",
    featureIds: ["localFiles", "apps", "inAppNavigation"],
  },
  {
    sectionKey: "assistant",
    featureIds: ["memory", "webMedia", "remindersSystem"],
  },
  { sectionKey: "device", featureIds: ["deviceAdvanced"] },
];

const FEATURE_BY_ID = new Map(ASSISTANT_FEATURE_DEFINITIONS.map((f) => [f.id, f]));

const COMMAND_TO_FEATURE = new Map<SystemCommandIdV1, AssistantFeatureId>();
for (const feature of ASSISTANT_FEATURE_DEFINITIONS) {
  for (const commandId of feature.commandIds) {
    COMMAND_TO_FEATURE.set(commandId, feature.id);
  }
}

/** Whether every command in the feature is installed (null installedIds = all on). */
export function isAssistantFeatureEnabled(
  installedIds: SystemCommandIdV1[] | null | undefined,
  featureId: AssistantFeatureId
): boolean {
  const feature = FEATURE_BY_ID.get(featureId);
  if (!feature) return true;
  return feature.commandIds.every((id) => isAssistantToolInstalledForCatalog(installedIds, id));
}

/** Enable or disable an entire capability (updates per-command install list). */
export function toggleAssistantFeatureInstall(
  installedIds: SystemCommandIdV1[] | null | undefined,
  featureId: AssistantFeatureId,
  enabled: boolean
): SystemCommandIdV1[] | null {
  const feature = FEATURE_BY_ID.get(featureId);
  if (!feature) return installedIds ?? null;
  let next = installedIds ?? null;
  for (const commandId of feature.commandIds) {
    next = toggleAssistantCatalogToolInstall(next, commandId, enabled ? "install" : "uninstall");
  }
  return next;
}

/** True when any command in the feature requires a confirmation modal. */
export function assistantFeatureNeedsHighRiskConfirm(featureId: AssistantFeatureId): boolean {
  const feature = FEATURE_BY_ID.get(featureId);
  if (!feature) return false;
  return feature.commandIds.some((id) => SYSTEM_COMMAND_CATALOG[id].risk === "high");
}

export function assistantFeatureDefinition(
  featureId: AssistantFeatureId
): AssistantFeatureDefinition | undefined {
  return FEATURE_BY_ID.get(featureId);
}

/** Validates catalog ↔ feature coverage (tests). */
export function allCatalogCommandsMappedToFeatures(): boolean {
  const mapped = new Set<SystemCommandIdV1>();
  for (const feature of ASSISTANT_FEATURE_DEFINITIONS) {
    for (const id of feature.commandIds) mapped.add(id);
  }
  return ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.every((id) => mapped.has(id));
}

export function featureIdForCommand(commandId: SystemCommandIdV1): AssistantFeatureId | null {
  return COMMAND_TO_FEATURE.get(commandId) ?? null;
}
