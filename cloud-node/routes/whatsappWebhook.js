const express = require("express");
const config = require("../lib/config");
const { allow } = require("../lib/rateLimit");
const { clientIp } = require("../lib/clientIp");
const { verifyWebhookSignature, extractWebhookChanges } = require("../lib/whatsappMeta");
const {
  accountIdForPhoneNumber,
  insertEventsFromWebhook,
  purgeOldEvents,
} = require("../lib/whatsappStore");

const router = express.Router();

const RATE_MAX = 120;
const RATE_WINDOW_MS = 60_000;

/**
 * Meta webhook verification (GET) and event ingest (POST).
 * Mounted with express.raw() so req.body is a Buffer.
 */
router.get("/", (req, res) => {
  if (!config.whatsapp.verifyToken) {
    return res.status(503).send("webhook not configured");
  }
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  if (mode === "subscribe" && token === config.whatsapp.verifyToken && challenge) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("forbidden");
});

router.post("/", async (req, res) => {
  if (!config.whatsapp.appSecret) {
    return res.status(503).json({ ok: false, error: "webhook not configured" });
  }

  if (!allow(`wa-webhook:${clientIp(req)}`, RATE_MAX, RATE_WINDOW_MS)) {
    return res.status(429).json({ ok: false, error: "rate limit" });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = req.get("x-hub-signature-256") || "";
  if (!verifyWebhookSignature(config.whatsapp.appSecret, rawBody, signature)) {
    return res.status(401).json({ ok: false, error: "invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(422).json({ ok: false, error: "invalid json" });
  }

  // Meta expects a quick 200 even when we skip unknown bindings.
  res.status(200).json({ ok: true });

  try {
    const changes = extractWebhookChanges(payload);
    for (const change of changes) {
      const accountId = await accountIdForPhoneNumber(change.phoneNumberId);
      if (!accountId) continue;
      await insertEventsFromWebhook(accountId, change.phoneNumberId, change);
      await purgeOldEvents(accountId, config.whatsapp.eventRetentionDays);
    }
  } catch (err) {
    console.error("[whatsapp-webhook] ingest failed:", err?.message || err);
  }
});

module.exports = router;
