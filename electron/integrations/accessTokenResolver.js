/**
 * Resolve OAuth / integration access tokens for a provider id.
 * Shared by IPC getToken and main-process HTTP token relay.
 */

const storage = require("./storage");
const google = require("./google");
const microsoft = require("./microsoft");
const dropbox = require("./dropbox");
const notion = require("./notion");
const slack = require("./slack");
const whatsapp = require("./whatsapp");
const s3 = require("./s3");
const icloud = require("./icloud");
const infomaniak = require("./infomaniak");

/**
 * @param {string} userData
 * @param {string} providerId
 * @param {import('./ipc/integrationCore')} core
 * @returns {Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; reason: string }>}
 */
async function resolveIntegrationAccessToken(userData, providerId, core) {
  const id = String(providerId || "").trim();
  if (!id) return { ok: false, reason: "providerId is required" };

  const ud = userData;

  if (id === "google-calendar") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_CALENDAR);
    if (!secrets?.access_token) return { ok: false, reason: "no_calendar_token" };
    const token = await google.getValidAccessToken(secrets);
    if (!token) return { ok: false, reason: "calendar_token_expired" };
    const expiresIn = secrets.expires_at
      ? Math.max(0, Math.floor((secrets.expires_at - Date.now()) / 1000))
      : 0;
    return { ok: true, token, expiresIn };
  }

  if (id === "google-gmail") {
    core.migrateLegacyGoogleProvider(ud);
    core.tryHydrateGoogleGmailFromMirror(ud);
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_GMAIL);
    if (!secrets?.access_token) return { ok: false, reason: "no_gmail_token" };
    const token = await google.getValidAccessToken(secrets);
    if (!token) return { ok: false, reason: "gmail_token_expired" };
    const expiresIn = secrets.expires_at
      ? Math.max(0, Math.floor((secrets.expires_at - Date.now()) / 1000))
      : 0;
    return { ok: true, token, expiresIn };
  }

  if (id === "google-drive") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_GOOGLE_DRIVE);
    if (!secrets?.access_token) return { ok: false, reason: "no_drive_token" };
    const token = await google.getValidAccessToken(secrets);
    if (!token) return { ok: false, reason: "drive_token_expired" };
    const expiresIn = secrets.expires_at
      ? Math.max(0, Math.floor((secrets.expires_at - Date.now()) / 1000))
      : 0;
    return { ok: true, token, expiresIn };
  }

  if (id === "google" || id === "google-all") {
    for (const slot of [
      core.PROVIDER_GOOGLE_ALL,
      core.PROVIDER_GOOGLE_CALENDAR,
      core.PROVIDER_GOOGLE_GMAIL,
      core.PROVIDER_GOOGLE_DRIVE,
    ]) {
      const secrets = storage.loadProviderSecrets(ud, slot);
      if (!secrets?.access_token) continue;
      const token = await google.getValidAccessToken(secrets);
      if (!token) continue;
      const expiresIn = secrets.expires_at
        ? Math.max(0, Math.floor((secrets.expires_at - Date.now()) / 1000))
        : 0;
      return { ok: true, token, expiresIn };
    }
    return { ok: false, reason: "no_google_token" };
  }

  if (id === "microsoft" || id === "onedrive" || id === "outlook") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_MICROSOFT);
    if (secrets && typeof secrets.access_token === "string" && secrets.access_token) {
      const token = await microsoft.getValidAccessToken(secrets);
      if (token) return { ok: true, token, expiresIn: 3600 };
    }
    return { ok: false, reason: "no_microsoft_token" };
  }

  if (id === "dropbox") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_DROPBOX);
    if (secrets && typeof secrets.access_token === "string" && secrets.access_token) {
      return { ok: true, token: secrets.access_token, expiresIn: 0 };
    }
    return { ok: false, reason: "no_dropbox_token" };
  }

  if (id === "notion") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_NOTION);
    if (secrets && typeof secrets.access_token === "string" && secrets.access_token) {
      return { ok: true, token: secrets.access_token, expiresIn: 0 };
    }
    return { ok: false, reason: "no_notion_token" };
  }

  if (id === "slack") {
    const secrets = storage.loadProviderSecrets(ud, core.PROVIDER_SLACK);
    if (secrets && typeof secrets.access_token === "string" && secrets.access_token) {
      return { ok: true, token: secrets.access_token, expiresIn: 0 };
    }
    return { ok: false, reason: "no_slack_token" };
  }

  if (id === "infomaniak" || id === "infomaniak-calendar") {
    for (const slot of [core.PROVIDER_INFOMANIAK, core.PROVIDER_INFOMANIAK_CALENDAR]) {
      const secrets = storage.loadProviderSecrets(ud, slot);
      if (!secrets || typeof secrets.access_token !== "string" || !secrets.access_token) continue;
      const token = await infomaniak.getValidAccessToken(secrets);
      if (token) return { ok: true, token, expiresIn: 3600 };
    }
    return { ok: false, reason: "no_infomaniak_token" };
  }

  if (id === "whatsapp") {
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_WHATSAPP);
    if (whatsapp.credentialsLookUsable(creds)) {
      return {
        ok: true,
        token: JSON.stringify({
          phone_number_id: creds.phone_number_id,
          access_token: creds.access_token,
          business_account_id: creds.business_account_id || "",
        }),
        expiresIn: 0,
      };
    }
    return { ok: false, reason: "no_whatsapp_cloud_credentials" };
  }

  if (id === "s3") {
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
    if (creds && creds.access_key_id && creds.secret_access_key) {
      return {
        ok: true,
        token: JSON.stringify({
          access_key_id: creds.access_key_id,
          secret_key: creds.secret_access_key,
          region: creds.region || "us-east-1",
          session_token: creds.session_token || undefined,
        }),
        expiresIn: 0,
      };
    }
    return { ok: false, reason: "no_s3_credentials" };
  }

  if (id === "icloud") {
    const settings = storage.loadProviderSecrets(ud, core.PROVIDER_ICLOUD);
    if (settings && settings.session_token) {
      return {
        ok: true,
        token: JSON.stringify({
          apple_id: settings.apple_id || "",
          session_token: settings.session_token,
          cookies: settings.cookies || {},
        }),
        expiresIn: 0,
      };
    }
    return { ok: false, reason: "no_icloud_session" };
  }

  return { ok: false, reason: `unknown_provider: ${id}` };
}

module.exports = { resolveIntegrationAccessToken };
