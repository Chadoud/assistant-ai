const crypto = require("crypto");

/**
 * Stable grouping key from error message + top stack lines.
 * @param {string | null | undefined} errorMessage
 * @param {string | null | undefined} stackTrace
 * @returns {string}
 */
function computeCrashSignature(errorMessage, stackTrace) {
  const msg = String(errorMessage || "unknown").slice(0, 200);
  const stack = String(stackTrace || "");
  const frames = stack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("|");
  return crypto.createHash("sha256").update(`${msg}::${frames}`).digest("hex").slice(0, 16);
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function parseLastEventsJson(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 16_384) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

const OPTIONAL_STRING_LIMITS = {
  instance_id: 128,
  session_id: 128,
  account_id: 36,
  source_detail: 64,
  active_feature: 64,
  active_tab: 64,
  intent_bucket: 64,
  tool_name: 64,
  llm_provider: 32,
  llm_error_class: 32,
  conversation_id_hash: 64,
  dedupe_key: 64,
  sentry_event_id: 64,
};

/**
 * Merge optional enriched fields from request body into crash row.
 * @param {Record<string, unknown>} body
 * @param {Record<string, string | null>} baseRow
 * @returns {{ row: Record<string, string | null>, error?: string }}
 */
function mergeEnrichedFields(body, baseRow) {
  const row = { ...baseRow };
  for (const [key, max] of Object.entries(OPTIONAL_STRING_LIMITS)) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") {
      row[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return { row, error: `field must be a string: ${key}` };
    }
    if (raw.length > max) {
      return { row, error: `field too long: ${key}` };
    }
    row[key] = raw;
  }

  row.last_events_json = parseLastEventsJson(body.last_events_json);
  row.crash_uuid =
    typeof body.crash_uuid === "string" && body.crash_uuid.length <= 36
      ? body.crash_uuid
      : crypto.randomUUID();
  row.crash_signature = computeCrashSignature(row.error_message, row.stack_trace);
  return { row };
}

module.exports = { computeCrashSignature, mergeEnrichedFields, parseLastEventsJson };
