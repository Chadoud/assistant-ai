/**
 * Validates parsed JSON from an exosites-action block. Types and catalog: {@link ./catalogMeta.ts}.
 */

export * from "./catalogMeta";

import { KNOWN_APPLICATION_KEYS } from "./knownApplicationKeys";
import type { AppTab, ParsedSystemCommandV1 } from "./catalogMeta";
import {
  isSystemCommandIdV1,
  isValidIntegrationIsoDateTime,
  isValidSaveTextFileName,
  MAX_GMAIL_SEARCH_MESSAGES,
  MAX_GMAIL_SEARCH_QUERY_CHARS,
  MAX_GOOGLE_CALENDAR_EVENTS,
  MAX_GRAPH_CALENDAR_EVENTS,
  MAX_GRAPH_MAIL_SEARCH_MESSAGES,
  MAX_INFOMANIAK_CALENDAR_EVENTS,
  MAX_SAVE_TEXT_FILE_CONTENT_CHARS,
  VALID_TABS,
} from "./catalogMeta";

export function validateParsedCommand(raw: unknown):
  | { ok: true; command: ParsedSystemCommandV1 }
  | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "not_object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) {
    return { ok: false, error: "bad_version" };
  }
  if (!isSystemCommandIdV1(o.commandId)) {
    return { ok: false, error: "unknown_command" };
  }
  const commandId = o.commandId;
  const args = o.args;
  if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
    return { ok: false, error: "bad_args" };
  }
  const argObj = (args as Record<string, unknown>) ?? {};

  switch (commandId) {
    case "navigate_tab": {
      const tab = argObj.tab;
      if (typeof tab !== "string" || !VALID_TABS.has(tab as AppTab)) {
        return { ok: false, error: "navigate_tab_bad_tab" };
      }
      if (Object.keys(argObj).some((k) => k !== "tab")) {
        return { ok: false, error: "navigate_tab_extra_keys" };
      }
      return { ok: true, command: { v: 1, commandId, args: { tab: tab as AppTab } } };
    }
    case "open_help":
    case "open_tour":
    case "open_output_folder":
    case "restart_backend": {
      if (Object.keys(argObj).length > 0) {
        return { ok: false, error: "unexpected_args" };
      }
      return { ok: true, command: { v: 1, commandId, args: {} } };
    }
    case "open_application": {
      const app = argObj.app;
      if (typeof app !== "string" || !KNOWN_APPLICATION_KEYS.has(app)) {
        return { ok: false, error: "open_application_unknown_app" };
      }
      if (Object.keys(argObj).some((k) => k !== "app")) {
        return { ok: false, error: "open_application_extra_keys" };
      }
      return { ok: true, command: { v: 1, commandId, args: { app } } };
    }
    case "open_workspace_folder": {
      const index = argObj.index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        return { ok: false, error: "open_workspace_bad_index" };
      }
      if (Object.keys(argObj).some((k) => k !== "index")) {
        return { ok: false, error: "open_workspace_extra_keys" };
      }
      return { ok: true, command: { v: 1, commandId, args: { index } } };
    }
    case "save_text_file": {
      const destination = argObj.destination;
      const fileName = argObj.fileName;
      const content = argObj.content;
      const workspaceIndex = argObj.workspaceIndex;
      if (destination !== "output" && destination !== "workspace") {
        return { ok: false, error: "save_text_bad_destination" };
      }
      if (destination === "workspace") {
        if (typeof workspaceIndex !== "number" || !Number.isInteger(workspaceIndex) || workspaceIndex < 0) {
          return { ok: false, error: "save_text_bad_workspace_index" };
        }
      } else if (workspaceIndex !== undefined) {
        return { ok: false, error: "save_text_extra_workspace_index" };
      }
      if (typeof fileName !== "string" || !isValidSaveTextFileName(fileName)) {
        return { ok: false, error: "save_text_bad_file_name" };
      }
      if (typeof content !== "string") {
        return { ok: false, error: "save_text_bad_content" };
      }
      if (content.length > MAX_SAVE_TEXT_FILE_CONTENT_CHARS) {
        return { ok: false, error: "save_text_content_too_large" };
      }
      const allowedKeys =
        destination === "workspace"
          ? new Set(["destination", "fileName", "content", "workspaceIndex"])
          : new Set(["destination", "fileName", "content"]);
      if (Object.keys(argObj).some((k) => !allowedKeys.has(k))) {
        return { ok: false, error: "save_text_extra_keys" };
      }
      if (destination === "output") {
        return {
          ok: true,
          command: { v: 1, commandId, args: { destination, fileName, content } },
        };
      }
      return {
        ok: true,
        command: {
          v: 1,
          commandId,
          args: { destination, fileName, content, workspaceIndex },
        },
      };
    }
    case "graph_onedrive_upload_text":
    case "google_drive_upload_text": {
      const fileName = argObj.fileName;
      const content = argObj.content;
      if (typeof fileName !== "string" || !isValidSaveTextFileName(fileName)) {
        return { ok: false, error: "cloud_upload_bad_file_name" };
      }
      if (typeof content !== "string") {
        return { ok: false, error: "cloud_upload_bad_content" };
      }
      if (content.length > MAX_SAVE_TEXT_FILE_CONTENT_CHARS) {
        return { ok: false, error: "cloud_upload_content_too_large" };
      }
      if (Object.keys(argObj).some((k) => k !== "fileName" && k !== "content")) {
        return { ok: false, error: "cloud_upload_extra_keys" };
      }
      return {
        ok: true,
        command: { v: 1, commandId, args: { fileName, content } },
      };
    }
    case "graph_calendar_list_events":
    case "google_calendar_list_events":
    case "infomaniak_calendar_list_events": {
      const startDateTime = argObj.startDateTime;
      const endDateTime = argObj.endDateTime;
      const maxEvents = argObj.maxEvents;
      if (!isValidIntegrationIsoDateTime(startDateTime) || !isValidIntegrationIsoDateTime(endDateTime)) {
        return { ok: false, error: "calendar_bad_datetime" };
      }
      if (Date.parse(startDateTime) >= Date.parse(endDateTime)) {
        return { ok: false, error: "calendar_bad_range" };
      }
      let cap = MAX_GRAPH_CALENDAR_EVENTS;
      if (commandId === "google_calendar_list_events") cap = MAX_GOOGLE_CALENDAR_EVENTS;
      if (commandId === "infomaniak_calendar_list_events") cap = MAX_INFOMANIAK_CALENDAR_EVENTS;
      const n =
        typeof maxEvents === "number" && Number.isInteger(maxEvents) && maxEvents >= 1 ? maxEvents : cap;
      const bounded = Math.min(cap, Math.max(1, n));
      const allowed = new Set(["startDateTime", "endDateTime", "maxEvents"]);
      if (Object.keys(argObj).some((k) => !allowed.has(k))) {
        return { ok: false, error: "calendar_extra_keys" };
      }
      return {
        ok: true,
        command: {
          v: 1,
          commandId,
          args: { startDateTime, endDateTime, maxEvents: bounded },
        },
      };
    }
    case "graph_mail_search": {
      const query = argObj.query;
      const maxMessages = argObj.maxMessages;
      if (query !== undefined && typeof query !== "string") {
        return { ok: false, error: "mail_search_bad_query" };
      }
      const qStr = typeof query === "string" ? query : "";
      if (qStr.length > MAX_GMAIL_SEARCH_QUERY_CHARS) {
        return { ok: false, error: "mail_search_query_too_long" };
      }
      const n =
        typeof maxMessages === "number" && Number.isInteger(maxMessages) && maxMessages >= 1
          ? maxMessages
          : MAX_GRAPH_MAIL_SEARCH_MESSAGES;
      const bounded = Math.min(MAX_GRAPH_MAIL_SEARCH_MESSAGES, Math.max(1, n));
      const allowed = new Set(["query", "maxMessages"]);
      if (Object.keys(argObj).some((k) => !allowed.has(k))) {
        return { ok: false, error: "mail_search_extra_keys" };
      }
      return {
        ok: true,
        command: { v: 1, commandId, args: { query: qStr, maxMessages: bounded } },
      };
    }
    case "gmail_search_messages": {
      const query = argObj.query;
      const maxMessages = argObj.maxMessages;
      if (typeof query !== "string") {
        return { ok: false, error: "gmail_search_bad_query" };
      }
      if (query.length > MAX_GMAIL_SEARCH_QUERY_CHARS) {
        return { ok: false, error: "gmail_search_query_too_long" };
      }
      const n =
        typeof maxMessages === "number" && Number.isInteger(maxMessages) && maxMessages >= 1
          ? maxMessages
          : MAX_GMAIL_SEARCH_MESSAGES;
      const bounded = Math.min(MAX_GMAIL_SEARCH_MESSAGES, Math.max(1, n));
      const allowed = new Set(["query", "maxMessages"]);
      if (Object.keys(argObj).some((k) => !allowed.has(k))) {
        return { ok: false, error: "gmail_search_extra_keys" };
      }
      return {
        ok: true,
        command: { v: 1, commandId, args: { query, maxMessages: bounded } },
      };
    }
    case "save_memory": {
      const category = argObj.category;
      const key      = argObj.key;
      const value    = argObj.value;
      const VALID_MEMORY_CATEGORIES = new Set([
        "identity",
        "preferences",
        "projects",
        "context",
        "notes",
        "relationships",
        "wishes",
      ]);
      if (typeof category !== "string" || !VALID_MEMORY_CATEGORIES.has(category))
        return { ok: false, error: "save_memory_bad_category" };
      if (typeof key !== "string" || key.length === 0 || key.length > 256)
        return { ok: false, error: "save_memory_bad_key" };
      if (typeof value !== "string" || value.length > 4096)
        return { ok: false, error: "save_memory_bad_value" };
      return { ok: true, command: { v: 1, commandId, args: { category, key, value } } };
    }
    case "list_directory": {
      const path = argObj.path;
      if (typeof path !== "string" || path.length === 0 || path.length > 1024)
        return { ok: false, error: "list_directory_bad_path" };
      return { ok: true, command: { v: 1, commandId, args: { path } } };
    }
    case "terminal_safe": {
      const cmd = argObj.cmd;
      if (typeof cmd !== "string" || cmd.length === 0 || cmd.length > 512)
        return { ok: false, error: "terminal_safe_bad_cmd" };
      return { ok: true, command: { v: 1, commandId, args: { cmd } } };
    }
    case "get_running_apps": {
      return { ok: true, command: { v: 1, commandId, args: {} } };
    }
    case "system_volume": {
      const level = argObj.level;
      if (typeof level !== "number" || level < 0 || level > 100)
        return { ok: false, error: "system_volume_bad_level" };
      return { ok: true, command: { v: 1, commandId, args: { level } } };
    }
    case "read_file": {
      const path = argObj.path;
      if (typeof path !== "string" || path.length === 0 || path.length > 1024)
        return { ok: false, error: "read_file_bad_path" };
      return { ok: true, command: { v: 1, commandId, args: { path } } };
    }
    case "open_app": {
      const appName = argObj.app_name ?? argObj.app;
      if (typeof appName !== "string" || appName.length === 0 || appName.length > 200)
        return { ok: false, error: "open_app_bad_name" };
      return { ok: true, command: { v: 1, commandId, args: { app_name: appName } } };
    }
    case "close_app": {
      const appName = argObj.app_name ?? argObj.app;
      if (typeof appName !== "string" || appName.length === 0 || appName.length > 200)
        return { ok: false, error: "close_app_bad_name" };
      return { ok: true, command: { v: 1, commandId, args: { app_name: appName } } };
    }
    case "web_search": {
      const query = argObj.query;
      if (typeof query !== "string" || query.length === 0 || query.length > 500)
        return { ok: false, error: "web_search_bad_query" };
      const mode = typeof argObj.mode === "string" ? argObj.mode.slice(0, 32) : "search";
      return { ok: true, command: { v: 1, commandId, args: { query, mode } } };
    }
    case "browser_control": {
      const url = argObj.url ?? argObj.query;
      if (typeof url !== "string" || url.length === 0 || url.length > 2000)
        return { ok: false, error: "browser_control_bad_url" };
      const action = typeof argObj.action === "string" ? argObj.action.slice(0, 32) : "open";
      return { ok: true, command: { v: 1, commandId, args: { url, action } } };
    }
    case "youtube_video": {
      const query = String(argObj.query ?? argObj.search ?? "");
      const action = typeof argObj.action === "string" ? argObj.action.slice(0, 32) : "play";
      if (action !== "trending" && query.length === 0)
        return { ok: false, error: "youtube_video_bad_query" };
      if (query.length > 500) return { ok: false, error: "youtube_video_query_too_long" };
      return { ok: true, command: { v: 1, commandId, args: { query, action, region: String(argObj.region ?? "US") } } };
    }
    case "reminder": {
      const message = argObj.message;
      if (typeof message !== "string" || message.length === 0 || message.length > 1000)
        return { ok: false, error: "reminder_bad_message" };
      return { ok: true, command: { v: 1, commandId, args: {
        message,
        date: typeof argObj.date === "string" ? argObj.date.slice(0, 32) : "",
        time: typeof argObj.time === "string" ? argObj.time.slice(0, 32) : "",
      }}};
    }
    case "computer_settings": {
      const action = String(argObj.action ?? argObj.description ?? "");
      if (action.length > 500) return { ok: false, error: "computer_settings_bad_action" };
      const value = typeof argObj.value === "string" ? argObj.value.slice(0, 200) : "";
      return { ok: true, command: { v: 1, commandId, args: { action, value } } };
    }
    default:
      return { ok: false, error: "unknown_command" };
  }
}

