/** Shared types for the v1 system command catalog and validators. */

export type SystemCommandRisk = "low" | "medium" | "high";

export type AppTab =
  | "exo"
  | "queue"
  | "overview"
  | "history"
  | "assistant"
  | "sources"
  | "settings";

export type SystemCommandIdV1 =
  | "navigate_tab"
  | "open_help"
  | "open_tour"
  | "open_output_folder"
  | "open_application"
  | "restart_backend"
  | "open_workspace_folder"
  | "save_text_file"
  | "graph_onedrive_upload_text"
  | "google_drive_upload_text"
  | "graph_calendar_list_events"
  | "graph_mail_search"
  | "google_calendar_list_events"
  | "gmail_search_messages"
  | "infomaniak_calendar_list_events"
  | "save_memory"
  | "list_directory"
  | "terminal_safe"
  | "get_running_apps"
  | "system_volume"
  | "read_file"
  | "open_app"
  | "close_app"
  | "web_search"
  | "browser_control"
  | "youtube_video"
  | "reminder"
  | "computer_settings";

export interface ParsedSystemCommandV1 {
  v: 1;
  commandId: SystemCommandIdV1;
  args: Record<string, unknown>;
}

export type AssistantIntegrationProviderKey = "microsoft" | "google" | "infomaniak";

export type SystemCommandCatalogEntry = {
  risk: SystemCommandRisk;
  description: string;
};
