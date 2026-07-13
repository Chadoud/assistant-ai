/**
 * WhatsApp Business Cloud API credentials (no consumer OAuth).
 *
 * Personal WhatsApp uses desktop automation in the Python backend; this module
 * stores optional Cloud API credentials for business-number sends.
 */

const HEALTH_TIMEOUT_MS = 15_000;
const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * @param {object | null | undefined} creds
 * @returns {boolean}
 */
function credentialsLookUsable(creds) {
  const phoneNumberId =
    typeof creds?.phone_number_id === "string" ? creds.phone_number_id.trim() : "";
  const accessToken =
    typeof creds?.access_token === "string" ? creds.access_token.trim() : "";
  return Boolean(phoneNumberId && accessToken);
}

/**
 * @param {object} creds
 * @returns {Promise<{ ok: boolean; reason?: string; displayPhoneNumber?: string }>}
 */
async function whatsAppCloudHealth(creds) {
  if (!credentialsLookUsable(creds)) {
    return { ok: false, reason: "missing_credentials" };
  }
  const phoneNumberId = creds.phone_number_id.trim();
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.access_token.trim()}` },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data?.error?.message === "string" ? data.error.message : `http_${res.status}`;
      return { ok: false, reason: msg };
    }
    return {
      ok: true,
      displayPhoneNumber:
        typeof data.display_phone_number === "string" ? data.display_phone_number : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} recipient E.164-ish phone string
 * @returns {string|null}
 */
function normalizeRecipientE164(recipient) {
  const digits = String(recipient || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Map Meta Graph errors to actionable copy (mirrors backend whatsapp_tool._friendly_whatsapp_error).
 * @param {string} raw
 * @returns {string}
 */
function friendlyWhatsAppError(raw) {
  const text = String(raw || "");
  const lower = text.toLowerCase();
  if (text.includes("131026") || (lower.includes("template") && lower.includes("required"))) {
    return (
      "WhatsApp requires an approved template for this recipient. " +
      "Use an approved template name, or message them via WhatsApp on your computer."
    );
  }
  if (text.includes("131047") || lower.includes("re-engagement") || lower.includes("24 hour")) {
    return (
      "Outside WhatsApp's 24-hour reply window — use an approved template " +
      "or message via the desktop app."
    );
  }
  if (text.includes("100") && lower.includes("invalid")) {
    return "Invalid phone number — include country code (e.g. +41791234567).";
  }
  if (text.includes("190") || lower.includes("invalid oauth") || lower.includes("access token")) {
    return (
      "WhatsApp Business API credentials expired or invalid. " +
      "Update them under External sources → WhatsApp."
    );
  }
  return text;
}

/**
 * @param {object} creds
 * @param {string} to
 * @param {string} text
 * @returns {Promise<{ ok: boolean; reason?: string; messageId?: string }>}
 */
async function sendWhatsAppCloudText(creds, to, text) {
  if (!credentialsLookUsable(creds)) {
    return { ok: false, reason: "missing_credentials" };
  }
  const digits = normalizeRecipientE164(to);
  if (!digits) {
    return { ok: false, reason: "invalid_phone_number" };
  }
  const body = (text || "").trim().slice(0, 4096);
  if (!body) {
    return { ok: false, reason: "empty_message" };
  }
  const phoneNumberId = creds.phone_number_id.trim();
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "text",
        text: { body },
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data?.error;
      const code = typeof err?.code === "number" ? err.code : null;
      const message = typeof err?.message === "string" ? err.message : "";
      const raw =
        code != null && message ? `(${code}) ${message}` : message || `http_${res.status}`;
      return { ok: false, reason: friendlyWhatsAppError(raw) };
    }
    const messageId =
      Array.isArray(data?.messages) && data.messages[0]?.id
        ? String(data.messages[0].id)
        : undefined;
    return { ok: true, messageId };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} creds
 * @param {string} businessAccountId
 * @param {number} [limit]
 * @returns {Promise<{ ok: boolean; reason?: string; templates?: Array<{ name: string; language?: string; status?: string; category?: string }> }>}
 */
async function listWhatsAppMessageTemplates(creds, businessAccountId, limit = 50) {
  if (!credentialsLookUsable(creds)) {
    return { ok: false, reason: "missing_credentials" };
  }
  const wabaId = String(businessAccountId || creds.business_account_id || "").trim();
  if (!wabaId) {
    return { ok: false, reason: "missing_business_account_id" };
  }
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/message_templates?limit=${safeLimit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.access_token.trim()}` },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data?.error?.message === "string" ? data.error.message : `http_${res.status}`;
      return { ok: false, reason: msg };
    }
    const templates = Array.isArray(data?.data)
      ? data.data
          .filter((row) => row && typeof row === "object")
          .map((row) => ({
            name: typeof row.name === "string" ? row.name : "",
            language: typeof row.language === "string" ? row.language : undefined,
            status: typeof row.status === "string" ? row.status : undefined,
            category: typeof row.category === "string" ? row.category : undefined,
          }))
          .filter((row) => row.name)
      : [];
    return { ok: true, templates };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  credentialsLookUsable,
  whatsAppCloudHealth,
  sendWhatsAppCloudText,
  listWhatsAppMessageTemplates,
};
