/**
 * Push integration OAuth tokens to the backend over authenticated HTTP (main process).
 */

const { backendFetch } = require("./backendHttp");
const core = require("./integrations/ipc/integrationCore");
const { resolveIntegrationAccessToken } = require("./integrations/accessTokenResolver");

const RELAY_PROVIDER_IDS = [
  "google-gmail",
  "google-drive",
  "google-calendar",
  "google-all",
  "microsoft",
  "onedrive",
  "outlook",
  "dropbox",
  "notion",
  "slack",
  "whatsapp",
  "s3",
  "icloud",
  "infomaniak",
  "infomaniak-calendar",
];

const GENERIC_FALLBACKS = [
  ["google-gmail", "google"],
  ["google-calendar", "google"],
  ["google-drive", "google"],
  ["google-all", "google"],
  ["microsoft", "microsoft"],
  ["onedrive", "microsoft"],
  ["outlook", "microsoft"],
];

/**
 * @param {string} providerId
 * @param {string} token
 * @param {number} expiresIn
 */
async function postTokenRelay(providerId, token, expiresIn) {
  const res = await backendFetch("/integration/token-relay", {
    method: "POST",
    body: {
      provider_id: providerId,
      token,
      expires_in: expiresIn,
    },
  });
  return res.ok;
}

/**
 * Relay all connected integration tokens to the backend credential cache.
 * @returns {Promise<{ ok: true; relayed: string[] } | { ok: false; reason: string }>}
 */
async function relayAllConnectedIntegrationTokens() {
  const ud = core.userData();
  const relayed = [];

  for (const providerId of RELAY_PROVIDER_IDS) {
    const result = await resolveIntegrationAccessToken(ud, providerId, core);
    if (!result.ok) continue;
    const posted = await postTokenRelay(providerId, result.token, result.expiresIn ?? 0);
    if (posted) relayed.push(providerId);
  }

  for (const [sourceId, genericId] of GENERIC_FALLBACKS) {
    if (!relayed.includes(sourceId)) continue;
    const result = await resolveIntegrationAccessToken(ud, sourceId, core);
    if (!result.ok) continue;
    await postTokenRelay(genericId, result.token, result.expiresIn ?? 0);
    if (!relayed.includes(genericId)) relayed.push(genericId);
  }

  return { ok: true, relayed };
}

module.exports = { relayAllConnectedIntegrationTokens, postTokenRelay };
