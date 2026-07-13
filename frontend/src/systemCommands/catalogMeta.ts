/**
 * System command v1 caps, tab allowlist, and shared validators for integration args.
 * Catalog entries and id checks: {@link ./catalog/aggregate.ts}.
 * Argument validation for parsed JSON: {@link ./catalog.ts} `validateParsedCommand`.
 */

export type {
  AppTab,
  AssistantIntegrationProviderKey,
  ParsedSystemCommandV1,
  SystemCommandCatalogEntry,
  SystemCommandIdV1,
  SystemCommandRisk,
} from "./catalog/types";

import type { AppTab, AssistantIntegrationProviderKey, SystemCommandIdV1 } from "./catalog/types";

export { isSystemCommandIdV1, SYSTEM_COMMAND_CATALOG } from "./catalog/aggregate";

export const EXOSITES_ACTION_FENCE = "exosites-action";

export const VALID_TABS: ReadonlySet<AppTab> = new Set([
  "exo",
  "queue",
  "overview",
  "history",
  "assistant",
  "sources",
  "settings",
]);

/** Max UTF-16 code units for save_text_file content (guardrail for IPC / disk). */
export const MAX_SAVE_TEXT_FILE_CONTENT_CHARS = 500_000;

/** Caps for integration read tools — mirrored in Electron ``systemCommandsV1.js``. */
export const MAX_GRAPH_CALENDAR_EVENTS = 50;
export const MAX_GRAPH_MAIL_SEARCH_MESSAGES = 25;
export const MAX_GOOGLE_CALENDAR_EVENTS = 50;
export const MAX_GMAIL_SEARCH_MESSAGES = 25;
export const MAX_INFOMANIAK_CALENDAR_EVENTS = 50;
export const MAX_GMAIL_SEARCH_QUERY_CHARS = 500;

const SAVE_TEXT_FILE_NAME_RE = /^[a-zA-Z0-9._\-\s]+$/;

/** Parses ISO-like datetimes the Graph/Google APIs accept (RFC 3339 subset). */
export function isValidIntegrationIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 8 || value.length > 64) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/** Which linked-account family an integration command uses (for Settings provider toggles). */
export function assistantIntegrationProviderForCommand(
  commandId: SystemCommandIdV1
): AssistantIntegrationProviderKey | null {
  switch (commandId) {
    case "graph_calendar_list_events":
    case "graph_mail_search":
      return "microsoft";
    case "google_calendar_list_events":
    case "gmail_search_messages":
      return "google";
    case "infomaniak_calendar_list_events":
      return "infomaniak";
    default:
      return null;
  }
}

/** Read-only integration tools (mail/calendar lists) — gated by assistant read tier + provider. */
export function isIntegrationReadSystemCommand(commandId: SystemCommandIdV1): boolean {
  return (
    commandId === "graph_calendar_list_events" ||
    commandId === "graph_mail_search" ||
    commandId === "google_calendar_list_events" ||
    commandId === "gmail_search_messages" ||
    commandId === "infomaniak_calendar_list_events"
  );
}

/** Basename only; .txt or .md — used by validateParsedCommand and mirrored in main. */
export function isValidSaveTextFileName(name: string): boolean {
  if (name.length === 0 || name.length > 128) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  const lower = name.toLowerCase();
  if (!lower.endsWith(".txt") && !lower.endsWith(".md")) return false;
  return SAVE_TEXT_FILE_NAME_RE.test(name);
}
