const crypto = require("crypto");
const express = require("express");
const config = require("../lib/config");
const { getPool } = require("../lib/db");
const { allow } = require("../lib/rateLimit");
const { clientIp } = require("../lib/clientIp");
const { optionalAuth } = require("../middleware/optionalAuth");
const { mergeEnrichedFields } = require("../lib/crashEnrich");
const { markSessionCrashed, ensureCrashTriageRow } = require("../lib/appSessions");

const router = express.Router();

const FIELD_LIMITS = {
  app_version: 64,
  environment: 32,
  ui_locale: 32,
  platform: 512,
  source: 32,
  error_message: 8000,
  stack_trace: 65000,
};

const RATE_MAX_EVENTS = 30;
const RATE_WINDOW_MS = 60_000;

function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** @returns {{ value: object } | { error: string }} */
function validate(body) {
  if (typeof body !== "object" || body === null) {
    return { error: "body must be an object" };
  }
  const required = ["app_version", "environment", "source", "error_message"];
  for (const key of required) {
    if (typeof body[key] !== "string" || body[key].length === 0) {
      return { error: `missing or invalid field: ${key}` };
    }
  }
  const row = {};
  for (const [key, max] of Object.entries(FIELD_LIMITS)) {
    const raw = body[key];
    if (raw === undefined || raw === null) {
      row[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return { error: `field must be a string: ${key}` };
    }
    if (raw.length > max) {
      return { error: `field too long: ${key}` };
    }
    row[key] = raw;
  }
  return { value: row };
}

router.post("/crash-reports", optionalAuth, async (req, res) => {
  if (!config.crashIngestToken) {
    return res.status(503).json({ ok: false, error: "crash ingest not configured" });
  }

  const provided = req.get("x-crash-token") || "";
  if (!tokensMatch(provided, config.crashIngestToken)) {
    return res.status(401).json({ ok: false, error: "invalid token" });
  }

  if (!allow(`crash:${clientIp(req)}`, RATE_MAX_EVENTS, RATE_WINDOW_MS)) {
    return res.status(429).json({ ok: false, error: "rate limit" });
  }

  const result = validate(req.body);
  if ("error" in result) {
    return res.status(422).json({ ok: false, error: result.error });
  }

  const enriched = mergeEnrichedFields(req.body, result.value);
  if (enriched.error) {
    return res.status(422).json({ ok: false, error: enriched.error });
  }
  const row = enriched.row;

  if (req.accountId && !row.account_id) {
    row.account_id = String(req.accountId).slice(0, 36);
  }

  try {
    const pool = getPool();

    if (row.dedupe_key) {
      const [existing] = await pool.query(
        `SELECT id FROM crash_reports
         WHERE dedupe_key = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         LIMIT 1`,
        [row.dedupe_key],
      );
      if (Array.isArray(existing) && existing.length > 0) {
        return res.json({ ok: true, deduplicated: true });
      }
    }

    const [insertResult] = await pool.query(
      `INSERT INTO crash_reports
        (crash_uuid, app_version, environment, ui_locale, platform, source, source_detail,
         error_message, stack_trace, instance_id, session_id, account_id, crash_signature,
         active_feature, active_tab, last_events_json, intent_bucket, tool_name,
         llm_provider, llm_error_class, conversation_id_hash, dedupe_key, sentry_event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.crash_uuid,
        row.app_version,
        row.environment,
        row.ui_locale,
        row.platform,
        row.source,
        row.source_detail,
        row.error_message,
        row.stack_trace,
        row.instance_id,
        row.session_id,
        row.account_id,
        row.crash_signature,
        row.active_feature,
        row.active_tab,
        row.last_events_json,
        row.intent_bucket,
        row.tool_name,
        row.llm_provider,
        row.llm_error_class,
        row.conversation_id_hash,
        row.dedupe_key,
        row.sentry_event_id,
      ],
    );
    const crashId = insertResult?.insertId ?? null;
    try {
      await markSessionCrashed(pool, {
        session_id: row.session_id,
        instance_id: row.instance_id,
        account_id: row.account_id,
        crash_id: crashId,
      });
      await ensureCrashTriageRow(pool, row.crash_signature);
    } catch {
      /* triage/session linkage must not block crash ingest */
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: "could not store crash report" });
  }
});

module.exports = router;
