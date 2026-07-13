/** Caps and small parsers for main-process system command validation (mirrors frontend catalogMeta). */

const MAX_GRAPH_CALENDAR_EVENTS = 50;
const MAX_GRAPH_MAIL_SEARCH_MESSAGES = 25;
const MAX_GOOGLE_CALENDAR_EVENTS = 50;
const MAX_GMAIL_SEARCH_MESSAGES = 25;
const MAX_INFOMANIAK_CALENDAR_EVENTS = 50;
const MAX_GMAIL_SEARCH_QUERY_CHARS = 500;

const VALID_TABS = new Set([
  "exo",
  "queue",
  "overview",
  "history",
  "assistant",
  "sources",
  "settings",
]);

const MAX_SAVE_TEXT_FILE_CONTENT_CHARS = 500_000;

function isValidIntegrationIsoDateTime(s) {
  if (typeof s !== "string" || s.length < 8 || s.length > 64) return false;
  return Number.isFinite(Date.parse(s));
}

function isValidSaveTextFileName(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 128) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return false;
  const lower = name.toLowerCase();
  if (!lower.endsWith(".txt") && !lower.endsWith(".md")) return false;
  return /^[a-zA-Z0-9._\-\s]+$/.test(name);
}

module.exports = {
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
};
