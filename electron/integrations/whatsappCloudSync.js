/**
 * Poll WhatsApp webhook events from cloud-node and relay them to the local Python backend.
 */

const fs = require("fs");
const path = require("path");
const cloudAuth = require("../cloudAuth");
const { BACKEND_PORT } = require("../constants");

const POLL_INTERVAL_MS = 60_000;
const WEBHOOK_CONFIG_TTL_MS = 60_000;
const PREFS_FILE = "whatsapp_cloud_sync.json";

/** @type {{ userData: string; at: number; data: object | null }} */
let webhookConfigCache = { userData: "", at: 0, data: null };

let pollTimer = null;
let pollingUserData = null;
let pollInFlight = false;

async function runPollOnce(userData) {
  if (pollInFlight) return { ok: true, skipped: true };
  pollInFlight = true;
  try {
    return await pollOnce(userData);
  } finally {
    pollInFlight = false;
  }
}

function prefsPath(userData) {
  return path.join(userData, PREFS_FILE);
}

function readPrefs(userData) {
  try {
    const raw = fs.readFileSync(prefsPath(userData), "utf8");
    const data = JSON.parse(raw);
    return {
      sinceId: Number(data.sinceId) || 0,
      phoneNumberId: typeof data.phoneNumberId === "string" ? data.phoneNumberId : "",
      enabled: Boolean(data.enabled),
    };
  } catch {
    return { sinceId: 0, phoneNumberId: "", enabled: false };
  }
}

function writePrefs(userData, prefs) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(prefsPath(userData), JSON.stringify(prefs, null, 2), "utf8");
}

async function relayEventsToBackend(events) {
  if (!Array.isArray(events) || events.length === 0) return;
  const url = `http://127.0.0.1:${BACKEND_PORT}/integration/whatsapp-events-relay`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`backend relay failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

/**
 * Register phone_number_id → cloud account so Meta webhooks route to this user.
 * @param {string} userData
 * @param {object} creds
 * @param {string|null|undefined} displayPhoneNumber
 */
async function registerPhoneBinding(userData, creds, displayPhoneNumber) {
  if (!cloudAuth.isAuthGateEnabled()) return { ok: false, reason: "cloud_auth_disabled" };
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) return { ok: false, reason: "not_logged_in" };

  await cloudAuth.postJsonAuthed("/v1/me/whatsapp/register", sess.access_token, {
    phone_number_id: creds.phone_number_id,
    business_account_id: creds.business_account_id || "",
    display_phone_number: displayPhoneNumber || "",
  });

  writePrefs(userData, {
    sinceId: 0,
    phoneNumberId: creds.phone_number_id,
    enabled: true,
  });
  return { ok: true };
}

/**
 * @param {string} userData
 * @param {string} phoneNumberId
 */
async function unregisterPhoneBinding(userData, phoneNumberId) {
  if (!cloudAuth.isAuthGateEnabled()) return;
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token || !phoneNumberId) return;
  try {
    await cloudAuth.deleteJson(
      `/v1/me/whatsapp/register/${encodeURIComponent(phoneNumberId)}`,
      sess.access_token,
    );
  } catch (err) {
    console.warn("[whatsappCloudSync] unregister failed:", err?.message || err);
  }
  writePrefs(userData, { sinceId: 0, phoneNumberId: "", enabled: false });
}

/**
 * @param {string} userData
 */
async function pollOnce(userData) {
  const prefs = readPrefs(userData);
  if (!prefs.enabled) return { ok: true, ingested: 0 };

  if (!cloudAuth.isAuthGateEnabled()) return { ok: false, reason: "cloud_auth_disabled" };
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) return { ok: false, reason: "not_logged_in" };

  const data = await cloudAuth.getJson(
    `/v1/me/whatsapp/events?since_id=${prefs.sinceId}&limit=100`,
    sess.access_token,
  );
  const events = Array.isArray(data.events) ? data.events : [];
  if (events.length > 0) {
    await relayEventsToBackend(events);
  }
  writePrefs(userData, {
    ...prefs,
    sinceId: Number(data.next_since_id) || prefs.sinceId,
  });
  return { ok: true, ingested: events.length };
}

/**
 * @param {string} userData
 */
function startPolling(userData) {
  stopPolling();
  pollingUserData = userData;
  void runPollOnce(userData).catch((err) => {
    console.warn("[whatsappCloudSync] initial poll failed:", err?.message || err);
  });
  pollTimer = setInterval(() => {
    if (!pollingUserData) return;
    void runPollOnce(pollingUserData).catch((err) => {
      console.warn("[whatsappCloudSync] poll failed:", err?.message || err);
    });
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollingUserData = null;
}

/**
 * Resume polling when WhatsApp Business API was previously configured.
 * @param {string} userData
 */
function resumeIfConfigured(userData) {
  const prefs = readPrefs(userData);
  if (prefs.enabled && prefs.phoneNumberId) {
    startPolling(userData);
  }
}

async function fetchWebhookConfig(userData) {
  const now = Date.now();
  if (
    webhookConfigCache.userData === userData &&
    webhookConfigCache.data &&
    now - webhookConfigCache.at < WEBHOOK_CONFIG_TTL_MS
  ) {
    return webhookConfigCache.data;
  }

  if (!cloudAuth.isAuthGateEnabled()) {
    return { ok: false, reason: "cloud_auth_disabled" };
  }
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) {
    return { ok: false, reason: "not_logged_in" };
  }
  try {
    const data = await cloudAuth.getJson("/v1/me/whatsapp/webhook-config", sess.access_token);
    const result = { ok: true, ...data };
    webhookConfigCache = { userData, at: now, data: result };
    return result;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchConnectConfig(userData) {
  if (!cloudAuth.isAuthGateEnabled()) {
    return { ok: false, reason: "cloud_auth_disabled", embedded_signup_available: false };
  }
  cloudAuth.migrateLegacyCloudSession(userData);
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) {
    return { ok: false, reason: "not_logged_in", embedded_signup_available: false };
  }
  try {
    const data = await cloudAuth.getJson("/v1/me/whatsapp/connect-config", sess.access_token);
    return { ok: true, ...data };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      embedded_signup_available: false,
    };
  }
}

/**
 * Exchange Meta Embedded Signup code for Cloud API credentials via cloud-node.
 * @param {string} userData
 * @param {object} payload
 */
async function exchangeEmbeddedSignup(userData, payload) {
  if (!cloudAuth.isAuthGateEnabled()) {
    return { ok: false, reason: "cloud_auth_disabled" };
  }
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) {
    return { ok: false, reason: "not_logged_in" };
  }
  try {
    const data = await cloudAuth.postJsonAuthed(
      "/v1/me/whatsapp/embedded-signup/exchange",
      sess.access_token,
      payload || {},
    );
    return data?.ok ? { ok: true, credentials: data.credentials } : { ok: false, reason: data?.error || "exchange_failed" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = {
  registerPhoneBinding,
  unregisterPhoneBinding,
  pollOnce,
  startPolling,
  stopPolling,
  resumeIfConfigured,
  readPrefs,
  fetchWebhookConfig,
  fetchConnectConfig,
  exchangeEmbeddedSignup,
};
