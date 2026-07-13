const crypto = require("crypto");

const BODY_PREVIEW_MAX = 500;

/**
 * Verify Meta WhatsApp webhook X-Hub-Signature-256 header.
 * @param {string} appSecret
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader
 * @returns {boolean}
 */
function verifyWebhookSignature(appSecret, rawBody, signatureHeader) {
  if (!appSecret || !rawBody || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * @param {unknown} body
 * @returns {Array<{
 *   phoneNumberId: string;
 *   businessAccountId: string;
 *   messages: Array<object>;
 *   statuses: Array<object>;
 * }>}
 */
function extractWebhookChanges(body) {
  if (!body || typeof body !== "object" || body.object !== "whatsapp_business_account") {
    return [];
  }
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const wabaId = String(entry.id || "");
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = change.value;
      if (!value || typeof value !== "object") continue;
      const phoneNumberId = String(value.metadata?.phone_number_id || "");
      if (!phoneNumberId) continue;
      out.push({
        phoneNumberId,
        businessAccountId: wabaId,
        messages: Array.isArray(value.messages) ? value.messages : [],
        statuses: Array.isArray(value.statuses) ? value.statuses : [],
      });
    }
  }
  return out;
}

/**
 * @param {object} message
 * @returns {string|null}
 */
function messageBodyPreview(message) {
  if (!message || typeof message !== "object") return null;
  if (message.type === "text" && message.text && typeof message.text.body === "string") {
    return message.text.body.slice(0, BODY_PREVIEW_MAX);
  }
  if (message.type) {
    return `[${message.type}]`;
  }
  return null;
}

module.exports = {
  verifyWebhookSignature,
  extractWebhookChanges,
  messageBodyPreview,
  BODY_PREVIEW_MAX,
};
