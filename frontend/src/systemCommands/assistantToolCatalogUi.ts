import type { SystemCommandIdV1 } from "./catalog";

/** Groups commands for the Settings UI — must cover every {@link SystemCommandIdV1} exactly once. */
export const ASSISTANT_TOOL_CATALOG_UI_GROUPS: readonly {
  readonly groupKey: AssistantToolCatalogUiGroupKey;
  readonly ids: readonly SystemCommandIdV1[];
}[] = [
  {
    groupKey: "app",
    ids: ["navigate_tab", "open_help", "open_tour", "restart_backend"],
  },
  {
    groupKey: "files",
    ids: ["open_output_folder", "open_workspace_folder", "save_text_file"],
  },
  { groupKey: "apps", ids: ["open_application"] },
  {
    groupKey: "microsoft",
    ids: ["graph_onedrive_upload_text", "graph_calendar_list_events", "graph_mail_search"],
  },
  {
    groupKey: "google",
    ids: ["google_drive_upload_text", "google_calendar_list_events", "gmail_search_messages"],
  },
  { groupKey: "infomaniak", ids: ["infomaniak_calendar_list_events"] },
  { groupKey: "memory", ids: ["save_memory"] },
  {
    groupKey: "device",
    ids: ["list_directory", "terminal_safe", "get_running_apps", "system_volume", "read_file"],
  },
  {
    groupKey: "exo",
    ids: ["open_app", "close_app", "web_search", "browser_control", "youtube_video", "reminder", "computer_settings"],
  },
] as const;

/** Flattened catalog order — matches every {@link SystemCommandIdV1} exactly once (see unit test). */
export const ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED: readonly SystemCommandIdV1[] =
  ASSISTANT_TOOL_CATALOG_UI_GROUPS.flatMap((g) => [...g.ids]);

const ASSISTANT_TOOL_CATALOG_UI_ID_SET = new Set<SystemCommandIdV1>(ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED);

/**
 * Whether an assistant system command is allowed when the user has narrowed the catalog install set.
 * Ids not listed in the Settings catalog are always treated as installed (defensive).
 */
export function isAssistantToolInstalledForCatalog(
  installedIds: SystemCommandIdV1[] | null | undefined,
  commandId: SystemCommandIdV1
): boolean {
  if (!ASSISTANT_TOOL_CATALOG_UI_ID_SET.has(commandId)) return true;
  if (installedIds == null) return true;
  return installedIds.includes(commandId);
}

/**
 * Returns the next persisted install list. `null` means “all catalog tools installed”.
 */
export function toggleAssistantCatalogToolInstall(
  installedIds: SystemCommandIdV1[] | null | undefined,
  commandId: SystemCommandIdV1,
  mode: "install" | "uninstall"
): SystemCommandIdV1[] | null {
  if (!ASSISTANT_TOOL_CATALOG_UI_ID_SET.has(commandId)) return installedIds ?? null;
  const ordered = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED;
  const set = new Set<SystemCommandIdV1>(installedIds ?? ordered);
  if (mode === "install") set.add(commandId);
  else set.delete(commandId);
  const next = ordered.filter((id) => set.has(id));
  return next.length === ordered.length ? null : next;
}

export type AssistantToolCatalogUiGroupKey =
  | "app"
  | "files"
  | "apps"
  | "microsoft"
  | "google"
  | "infomaniak"
  | "memory"
  | "device"
  | "exo";
