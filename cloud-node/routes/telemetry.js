const express = require("express");
const { getPool } = require("../lib/db");
const { allow } = require("../lib/rateLimit");
const { clientIp } = require("../lib/clientIp");
const { optionalAuth } = require("../middleware/optionalAuth");
const { validateEventsBatch, validateFeedback } = require("../lib/telemetryValidate");
const { insertTelemetryEvents, insertProductFeedback } = require("../lib/telemetryStore");
const { upsertSessionsFromTelemetry } = require("../lib/appSessions");

const router = express.Router();

const RATE = {
  eventsIp: { max: 120, windowMs: 60_000 },
  eventsInstance: { max: 60, windowMs: 60_000 },
  feedbackIp: { max: 20, windowMs: 60_000 },
  feedbackInstance: { max: 10, windowMs: 300_000 },
};

/**
 * @param {import("express").Request} req
 * @param {string} prefix
 * @param {{ max: number, windowMs: number }} ipLimit
 * @param {{ max: number, windowMs: number } | null} instanceLimit
 * @returns {boolean}
 */
function rateLimitIngest(req, prefix, ipLimit, instanceLimit) {
  const ip = clientIp(req);
  if (!allow(`${prefix}:${ip}`, ipLimit.max, ipLimit.windowMs)) {
    return false;
  }
  if (instanceLimit && req.accountId) {
    const inst = String(req.body?.instance_id || "").slice(0, 48);
    if (!allow(`${prefix}:i:${inst}`, instanceLimit.max, instanceLimit.windowMs)) {
      return false;
    }
  }
  return true;
}

router.post("/telemetry/events", optionalAuth, async (req, res) => {
  if (!rateLimitIngest(req, "tel", RATE.eventsIp, RATE.eventsInstance)) {
    return res.status(429).json({ ok: false, error: "rate limit" });
  }

  const result = validateEventsBatch(req.body);
  if ("error" in result) {
    return res.status(422).json({ ok: false, error: result.error });
  }

  try {
    const pool = getPool();
    await insertTelemetryEvents(pool, req.accountId || null, result.rows);
    try {
      await upsertSessionsFromTelemetry(pool, req.accountId || null, result.rows);
    } catch {
      /* session tracking must not block telemetry ingest */
    }
    return res.json({ ok: true, stored: result.rows.length });
  } catch {
    return res.status(502).json({ ok: false, error: "could not store events" });
  }
});

router.post("/telemetry/feedback", optionalAuth, async (req, res) => {
  if (!rateLimitIngest(req, "fb", RATE.feedbackIp, RATE.feedbackInstance)) {
    return res.status(429).json({ ok: false, error: "rate limit" });
  }

  const result = validateFeedback(req.body);
  if ("error" in result) {
    return res.status(422).json({ ok: false, error: result.error });
  }

  try {
    const pool = getPool();
    await insertProductFeedback(pool, req.accountId || null, result.row);
    return res.json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: "could not store feedback" });
  }
});

module.exports = router;
