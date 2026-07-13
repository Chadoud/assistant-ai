/**
 * Mirror opt-in telemetry and feedback to api.exosites.ch.
 * Works signed-in (Bearer) or anonymous — local SQLite remains offline source of truth.
 */

const { app } = require("electron");
const { cloudBaseUrl, readSession } = require("./cloudAuth");

/**
 * @param {string} userData
 * @returns {{ base: string, token: string | null } | null}
 */
function cloudPostContext(userData) {
  const base = cloudBaseUrl();
  if (!base) return null;
  const sess = readSession(userData);
  return { base, token: sess?.access_token || null };
}

/**
 * @param {string} relPath
 * @param {string} bodyStr
 * @param {string} userData
 */
async function postCloud(relPath, bodyStr, userData) {
  const ctx = cloudPostContext(userData);
  if (!ctx) return false;
  const headers = { "Content-Type": "application/json" };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
  try {
    const res = await fetch(`${ctx.base}${relPath}`, { method: "POST", headers, body: bodyStr });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fire-and-forget event batch sync (signed-in users get account_id on the server). */
function syncEventsBatch(bodyStr) {
  const userData = app.getPath("userData");
  void postCloud("/v1/telemetry/events", bodyStr, userData);
}

/** Fire-and-forget feedback sync. */
function syncFeedback(bodyStr) {
  const userData = app.getPath("userData");
  void postCloud("/v1/telemetry/feedback", bodyStr, userData);
}

module.exports = { syncEventsBatch, syncFeedback, postCloud };
