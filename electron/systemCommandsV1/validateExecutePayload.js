/**
 * Main-process validation for AI system commands (mirrors frontend/src/systemCommands/catalog.ts).
 */

const { isKnownApplicationKey } = require("../knownApplications");
const { validateTerminalCommand, MAX_TERMINAL_CMD_CHARS } = require("./terminalSafe");
const {
  MAX_GRAPH_CALENDAR_EVENTS,
  MAX_GRAPH_MAIL_SEARCH_MESSAGES,
  MAX_GOOGLE_CALENDAR_EVENTS,
  MAX_GMAIL_SEARCH_MESSAGES,
  MAX_INFOMANIAK_CALENDAR_EVENTS,
  MAX_GMAIL_SEARCH_QUERY_CHARS,
  VALID_TABS,
  MAX_SAVE_TEXT_FILE_CONTENT_CHARS,
  isValidIntegrationIsoDateTime,
  isValidSaveTextFileName,
} = require("./caps");

/**
 * @param {unknown} raw
 * @returns {{ ok: true; command: { v: 1; commandId: string; args: Record<string, unknown> }; context: { outputDir?: string } } | { ok: false; error: string }}
 */
function validateExecutePayload(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "bad_payload" };
  }
  const p = /** @type {Record<string, unknown>} */ (raw);
  const commandId = p.commandId;
  const args = p.args;
  const context = p.context;

  if (typeof commandId !== "string" || !commandId) {
    return { ok: false, error: "bad_command_id" };
  }
  if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args))) {
    return { ok: false, error: "bad_args" };
  }
  const argObj = /** @type {Record<string, unknown>} */ (args ?? {});

  let command;
  switch (commandId) {
    case "navigate_tab": {
      const tab = argObj.tab;
      if (typeof tab !== "string" || !VALID_TABS.has(tab)) {
        return { ok: false, error: "navigate_tab_bad_tab" };
      }
      if (Object.keys(argObj).some((k) => k !== "tab")) {
        return { ok: false, error: "navigate_tab_extra_keys" };
      }
      command = { v: 1, commandId, args: { tab } };
      break;
    }
    case "open_help":
    case "open_tour":
    case "open_output_folder":
    case "restart_backend": {
      if (Object.keys(argObj).length > 0) {
        return { ok: false, error: "unexpected_args" };
      }
      command = { v: 1, commandId, args: {} };
      break;
    }
    case "open_application": {
      const app = argObj.app;
      if (typeof app !== "string" || !isKnownApplicationKey(app)) {
        return { ok: false, error: "open_application_unknown_app" };
      }
      if (Object.keys(argObj).some((k) => k !== "app")) {
        return { ok: false, error: "open_application_extra_keys" };
      }
      command = { v: 1, commandId, args: { app } };
      break;
    }
    case "open_workspace_folder": {
      const index = argObj.index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        return { ok: false, error: "open_workspace_bad_index" };
      }
      if (Object.keys(argObj).some((k) => k !== "index")) {
        return { ok: false, error: "open_workspace_extra_keys" };
      }
      command = { v: 1, commandId, args: { index } };
      break;
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
        command = { v: 1, commandId, args: { destination, fileName, content } };
      } else {
        command = { v: 1, commandId, args: { destination, fileName, content, workspaceIndex } };
      }
      break;
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
      command = { v: 1, commandId, args: { fileName, content } };
      break;
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
      command = {
        v: 1,
        commandId,
        args: { startDateTime, endDateTime, maxEvents: bounded },
      };
      break;
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
      command = { v: 1, commandId, args: { query: qStr, maxMessages: bounded } };
      break;
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
      command = { v: 1, commandId, args: { query, maxMessages: bounded } };
      break;
    }
    // ── Memory ────────────────────────────────────────────────────────────────
    case "save_memory": {
      const { category, key, value } = argObj;
      const VALID_CATS = new Set([
        "identity",
        "preferences",
        "projects",
        "context",
        "notes",
        "relationships",
        "wishes",
      ]);
      if (typeof category !== "string" || !VALID_CATS.has(category))
        return { ok: false, error: "save_memory_bad_category" };
      if (typeof key !== "string" || key.length === 0 || key.length > 256)
        return { ok: false, error: "save_memory_bad_key" };
      if (typeof value !== "string" || value.length > 4096)
        return { ok: false, error: "save_memory_bad_value" };
      command = { v: 1, commandId, args: { category, key, value } };
      break;
    }

    // ── System control ────────────────────────────────────────────────────────
    case "list_directory": {
      const p = argObj.path;
      if (typeof p !== "string" || p.length === 0 || p.length > 1024)
        return { ok: false, error: "list_directory_bad_path" };
      command = { v: 1, commandId, args: { path: p } };
      break;
    }
    case "terminal_safe": {
      const cmd = argObj.cmd;
      if (typeof cmd !== "string" || cmd.length === 0 || cmd.length > MAX_TERMINAL_CMD_CHARS)
        return { ok: false, error: "terminal_safe_bad_cmd" };
      const v = validateTerminalCommand(cmd);
      if (!v.ok) return v;
      command = { v: 1, commandId, args: { cmd } };
      break;
    }
    case "get_running_apps": {
      command = { v: 1, commandId, args: {} };
      break;
    }
    case "system_volume": {
      const level = argObj.level;
      if (typeof level !== "number" || level < 0 || level > 100)
        return { ok: false, error: "system_volume_bad_level" };
      command = { v: 1, commandId, args: { level } };
      break;
    }
    case "read_file": {
      const fp = argObj.path;
      if (typeof fp !== "string" || fp.length === 0 || fp.length > 1024)
        return { ok: false, error: "read_file_bad_path" };
      command = { v: 1, commandId, args: { path: fp } };
      break;
    }

    // ── Apps & web ────────────────────────────────────────────────────────────
    case "open_app": {
      const appName = argObj.app_name ?? argObj.app;
      if (typeof appName !== "string" || appName.length === 0 || appName.length > 200)
        return { ok: false, error: "open_app_bad_name" };
      command = { v: 1, commandId, args: { app_name: appName } };
      break;
    }
    case "close_app": {
      const appName = argObj.app_name ?? argObj.app;
      if (typeof appName !== "string" || appName.length === 0 || appName.length > 200)
        return { ok: false, error: "close_app_bad_name" };
      command = { v: 1, commandId, args: { app_name: appName } };
      break;
    }
    case "web_search": {
      const query = argObj.query;
      if (typeof query !== "string" || query.length === 0 || query.length > 500)
        return { ok: false, error: "web_search_bad_query" };
      const mode = typeof argObj.mode === "string" ? argObj.mode.slice(0, 32) : "search";
      command = { v: 1, commandId, args: { query, mode } };
      break;
    }
    case "browser_control": {
      const url = argObj.url ?? argObj.query;
      if (typeof url !== "string" || url.length === 0 || url.length > 2000)
        return { ok: false, error: "browser_control_bad_url" };
      const action = typeof argObj.action === "string" ? argObj.action.slice(0, 32) : "open";
      command = { v: 1, commandId, args: { url, action } };
      break;
    }
    case "youtube_video": {
      const query = argObj.query ?? argObj.search ?? "";
      const action = typeof argObj.action === "string" ? argObj.action.slice(0, 32) : "play";
      if (action !== "trending" && (typeof query !== "string" || query.length === 0))
        return { ok: false, error: "youtube_video_bad_query" };
      if (typeof query === "string" && query.length > 500)
        return { ok: false, error: "youtube_video_query_too_long" };
      command = { v: 1, commandId, args: { query: String(query), action, region: String(argObj.region ?? "US") } };
      break;
    }
    case "reminder": {
      const message = argObj.message;
      if (typeof message !== "string" || message.length === 0 || message.length > 1000)
        return { ok: false, error: "reminder_bad_message" };
      const dateStr = typeof argObj.date === "string" ? argObj.date.slice(0, 32) : "";
      const timeStr = typeof argObj.time === "string" ? argObj.time.slice(0, 32) : "";
      command = { v: 1, commandId, args: { message, date: dateStr, time: timeStr } };
      break;
    }
    case "computer_settings": {
      const action = argObj.action ?? argObj.description ?? "";
      if (typeof action !== "string" || action.length > 500)
        return { ok: false, error: "computer_settings_bad_action" };
      const value = typeof argObj.value === "string" ? argObj.value.slice(0, 200) : "";
      command = { v: 1, commandId, args: { action, value } };
      break;
    }

    default:
      return { ok: false, error: "unknown_command" };
  }

  /** @type {{ outputDir?: string; authorizedWorkspacePaths?: string[] }} */
  const ctx = {};
  if (context !== undefined) {
    if (context === null || typeof context !== "object" || Array.isArray(context)) {
      return { ok: false, error: "bad_context" };
    }
    const c = /** @type {Record<string, unknown>} */ (context);
    if (c.outputDir !== undefined) {
      if (typeof c.outputDir !== "string") {
        return { ok: false, error: "bad_output_dir" };
      }
      ctx.outputDir = c.outputDir;
    }
    if (c.authorizedWorkspacePaths !== undefined) {
      if (!Array.isArray(c.authorizedWorkspacePaths)) {
        return { ok: false, error: "bad_authorized_paths" };
      }
      ctx.authorizedWorkspacePaths = c.authorizedWorkspacePaths.filter((x) => typeof x === "string");
    }
  }

  if (commandId === "open_output_folder") {
    const out = (ctx.outputDir ?? "").trim();
    if (!out) {
      return { ok: false, error: "no_output_dir" };
    }
  }

  if (commandId === "open_workspace_folder") {
    const idx = /** @type {{ index?: number }} */ (command.args).index;
    const paths = ctx.authorizedWorkspacePaths ?? [];
    if (typeof idx !== "number" || idx < 0 || idx >= paths.length || !(paths[idx] ?? "").trim()) {
      return { ok: false, error: "workspace_index_invalid" };
    }
  }

  if (commandId === "save_text_file") {
    const a = /** @type {{ destination?: string; workspaceIndex?: number }} */ (command.args);
    if (a.destination === "output") {
      const out = (ctx.outputDir ?? "").trim();
      if (!out) {
        return { ok: false, error: "no_output_dir" };
      }
    } else if (a.destination === "workspace") {
      const idx = a.workspaceIndex;
      const paths = ctx.authorizedWorkspacePaths ?? [];
      if (typeof idx !== "number" || idx < 0 || idx >= paths.length || !(paths[idx] ?? "").trim()) {
        return { ok: false, error: "workspace_index_invalid" };
      }
    }
  }

  // ── New Phase 1–4 commands ────────────────────────────────────────────────
  if (commandId === "save_memory") {
    const { category, key, value } = command.args;
    const VALID_MEMORY_CATS = new Set([
      "identity",
      "preferences",
      "projects",
      "context",
      "notes",
      "relationships",
      "wishes",
    ]);
    if (typeof category !== "string" || !VALID_MEMORY_CATS.has(category))
      return { ok: false, error: "save_memory_bad_category" };
    if (typeof key !== "string" || key.length === 0 || key.length > 256)
      return { ok: false, error: "save_memory_bad_key" };
    if (typeof value !== "string" || value.length > 4096)
      return { ok: false, error: "save_memory_bad_value" };
  }

  if (commandId === "list_directory") {
    const { path } = command.args;
    if (typeof path !== "string" || path.length === 0 || path.length > 1024)
      return { ok: false, error: "list_directory_bad_path" };
  }

  if (commandId === "terminal_safe") {
    const { cmd } = command.args;
    const v = validateTerminalCommand(cmd);
    if (!v.ok) return v;
  }

  if (commandId === "system_volume") {
    const { level } = command.args;
    if (typeof level !== "number" || level < 0 || level > 100)
      return { ok: false, error: "system_volume_bad_level" };
  }

  if (commandId === "read_file") {
    const { path } = command.args;
    if (typeof path !== "string" || path.length === 0 || path.length > 1024)
      return { ok: false, error: "read_file_bad_path" };
  }

  return { ok: true, command, context: ctx };
}

module.exports = { validateExecutePayload };
