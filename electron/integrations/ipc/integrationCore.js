/**
 * Pure helper functions for the integration IPC layer.
 *
 * No `ipcMain` calls here — only session resolution, staging validation,
 * secret persistence, and the provider-state queries used by both the IPC
 * handlers (ipc.js) and systemCommandHandlers.js.
 *
 * Consumers: ipc.js (via require) and indirectly systemCommandHandlers.js
 * (which re-imports the exported symbols from ipc.js to preserve the existing
 * public contract).
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const storage = require("../storage");
const google = require("../google");
const microsoft = require("../microsoft");
const dropbox = require("../dropbox");
const notion = require("../notion");
const slack = require("../slack");
const whatsapp = require("../whatsapp");
const infomaniak = require("../infomaniak");
const infomaniakTokenStore = require("../infomaniakTokenStore");
const { PROVIDER_DEFINITIONS } = require("../providersCatalog");

// ─── Provider ID constants ────────────────────────────────────────────────────

const PROVIDER_GOOGLE_LEGACY = "google";
const PROVIDER_GOOGLE_GMAIL = "google-gmail";
const PROVIDER_GOOGLE_DRIVE = "google-drive";
const PROVIDER_MICROSOFT = "microsoft";
const PROVIDER_ONEDRIVE = "onedrive";
const PROVIDER_DROPBOX = "dropbox";
const PROVIDER_OUTLOOK = "outlook";
const PROVIDER_NOTION = "notion";
const PROVIDER_S3 = "s3";
const PROVIDER_SLACK = "slack";
const PROVIDER_WHATSAPP = "whatsapp";
const PROVIDER_ICLOUD = "icloud";
const PROVIDER_INFOMANIAK = "infomaniak";
const PROVIDER_GOOGLE_CALENDAR = "google-calendar";
/** Pseudo-provider: single OAuth with union scopes → fills Gmail, Drive, and Calendar slots. */
const PROVIDER_GOOGLE_ALL = "google-all";
const PROVIDER_INFOMANIAK_CALENDAR = "infomaniak-calendar";
/** Pseudo-provider: one OAuth → fills kDrive + Calendar slots when scopes allow. */
const PROVIDER_INFOMANIAK_ALL = "infomaniak-all";

// ─── Paths / environment ──────────────────────────────────────────────────────

function userData() {
  // PROFILE vault — integrations, OAuth secrets, and staging live per account.
  return require("../../accountProfile").resolveProfileRoot();
}

/** Options for env-file helpers that need to locate .env across dev/packaged builds. */
function infomaniakEnvOpts() {
  return {
    isDev: !app.isPackaged,
    backendDir: path.join(__dirname, "..", "..", "..", "backend"),
    resourcesPath: process.resourcesPath || "",
    userData: require("../../accountProfile").resolveProfileRoot(),
  };
}

/** Top-level dirs under profile root where integration imports may write. */
const INTEGRATION_STAGING_ROOT_DIRS = [
  "drive_sort_staging",
  "dropbox_sort_staging",
  "onedrive_sort_staging",
  "outlook_sort_staging",
  "box_sort_staging",
  "s3_sort_staging",
  "slack_sort_staging",
  "icloud_sort_staging",
  "infomaniak_sort_staging",
  "infomaniak_mail_sort_staging",
  "gmail_imports",
  "browser_uploads",
];

function integrationStagingAllowedRoots(ud) {
  return INTEGRATION_STAGING_ROOT_DIRS.map((dir) => path.join(ud, dir));
}

// ─── Staging directory helpers ────────────────────────────────────────────────

/**
 * Assert that a staging directory path is confined to the allowed roots under
 * userData. Throws if the path escapes those roots.
 * @param {string} dir
 * @param {string} ud - result of userData()
 */
function assertSafeStagingDir(dir, ud) {
  const resolved = path.resolve(dir);
  const allowedRoots = integrationStagingAllowedRoots(ud);
  const safe = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!safe) {
    throw new Error(`staging_dir_outside_allowed_root: ${path.basename(resolved)}`);
  }
}

/**
 * Validate and resolve a staging directory.
 * @param {{ reuseStaging: string | null; ud: string; makeNewStaging: () => string }} opts
 * @returns {{ ok: false; reason: string } | { ok: true; stagingDir: string }}
 */
function resolveStagingDir({ reuseStaging, ud, makeNewStaging }) {
  if (reuseStaging) {
    try {
      assertSafeStagingDir(reuseStaging, ud);
    } catch {
      return { ok: false, reason: "invalid_staging_dir" };
    }
    return { ok: true, stagingDir: reuseStaging };
  }
  return { ok: true, stagingDir: makeNewStaging() };
}

// ─── Token / session helpers ──────────────────────────────────────────────────

/**
 * Load, refresh-if-needed, and return a valid access token for any OAuth provider.
 * @returns {Promise<{ ok: false; reason: string } | { ok: true; secrets: object; token: string }>}
 */
async function loadFreshAccessToken({ ud, storageKey, looksUsable, refresh, save, getValid }) {
  let secrets = storage.loadProviderSecrets(ud, storageKey);
  if (!looksUsable(secrets)) return { ok: false, reason: "not_connected" };
  const refreshed = await refresh(secrets);
  if (refreshed) {
    const saved = save(ud, refreshed);
    if (saved && saved.ok === false) {
      return { ok: false, reason: saved.reason || "token_save_failed" };
    }
    secrets = refreshed;
  }
  const token = await getValid(secrets);
  if (!token) return { ok: false, reason: "token_unavailable" };
  return { ok: true, secrets, token };
}

function googleSessionLooksUsable(secrets) {
  return Boolean(
    (secrets && typeof secrets.refresh_token === "string" && secrets.refresh_token) ||
      (secrets && typeof secrets.access_token === "string" && secrets.access_token)
  );
}

function microsoftSessionLooksUsable(secrets) {
  return Boolean(secrets && typeof secrets.access_token === "string" && secrets.access_token);
}

function dropboxSessionLooksUsable(secrets) {
  return Boolean(secrets && typeof secrets.access_token === "string" && secrets.access_token);
}

/** Convenience wrapper for the Google Drive / Gmail OAuth slot. */
async function ensureGoogleSession(ud, storageKey) {
  return loadFreshAccessToken({
    ud,
    storageKey,
    looksUsable: googleSessionLooksUsable,
    refresh: google.refreshStoredTokens.bind(google),
    save: (u, s) => storage.saveProviderSecrets(u, storageKey, s),
    getValid: google.getValidAccessToken.bind(google),
  });
}

/** Convenience wrapper for the Microsoft (OneDrive + Outlook) slot. */
async function ensureMicrosoftSession(ud) {
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_MICROSOFT,
    looksUsable: microsoftSessionLooksUsable,
    refresh: microsoft.refreshStoredTokens.bind(microsoft),
    save: (u, s) => storage.saveProviderSecrets(u, PROVIDER_MICROSOFT, s),
    getValid: microsoft.getValidAccessToken.bind(microsoft),
  });
}

/** Convenience wrapper for the Dropbox slot. */
async function ensureDropboxSession(ud) {
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_DROPBOX,
    looksUsable: dropboxSessionLooksUsable,
    refresh: dropbox.refreshDropboxTokens.bind(dropbox),
    save: (u, s) => saveDropboxSecrets(u, s),
    getValid: (s) => Promise.resolve(dropbox.getValidAccessToken(s)),
  });
}

/** Convenience wrapper for the Notion slot (token is long-lived; no refresh). */
async function ensureNotionSession(ud) {
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_NOTION,
    looksUsable: notion.notionSessionLooksUsable,
    refresh: notion.refreshStoredTokens.bind(notion),
    save: (u, s) => storage.saveProviderSecrets(u, PROVIDER_NOTION, s),
    getValid: notion.getValidAccessToken.bind(notion),
  });
}

/** Convenience wrapper for the Slack slot. */
async function ensureSlackSession(ud) {
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_SLACK,
    looksUsable: slack.slackSessionLooksUsable,
    refresh: slack.refreshStoredTokens.bind(slack),
    save: (u, s) => storage.saveProviderSecrets(u, PROVIDER_SLACK, s),
    getValid: slack.getValidAccessToken.bind(slack),
  });
}

/**
 * Convenience wrapper for the Infomaniak slot.
 *
 * Priority order:
 *   1. Personal API token saved via the in-app setup guide.
 *   2. EXOSITES_INFOMANIAK_TOKEN env variable.
 *   3. OAuth2 PKCE session stored on disk.
 */
async function ensureInfomaniakSession(ud) {
  const personalToken = infomaniakTokenStore.loadInfomaniakApiToken();
  if (personalToken && infomaniakTokenStore.isValidInfomaniakApiToken(personalToken)) {
    return { ok: true, secrets: {}, token: personalToken };
  }
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_INFOMANIAK,
    looksUsable: infomaniak.infomaniakSessionLooksUsable,
    refresh: infomaniak.refreshStoredTokens.bind(infomaniak),
    save: (u, s) => storage.saveProviderSecrets(u, PROVIDER_INFOMANIAK, s),
    getValid: infomaniak.getValidAccessToken.bind(infomaniak),
  });
}

/** Calendar-specific OAuth row (separate from kDrive when users connect independently). */
async function ensureInfomaniakCalendarSession(ud) {
  return loadFreshAccessToken({
    ud,
    storageKey: PROVIDER_INFOMANIAK_CALENDAR,
    looksUsable: infomaniak.infomaniakSessionLooksUsable,
    refresh: infomaniak.refreshStoredTokens.bind(infomaniak),
    save: (u, s) => storage.saveProviderSecrets(u, PROVIDER_INFOMANIAK_CALENDAR, s),
    getValid: infomaniak.getValidAccessToken.bind(infomaniak),
  });
}

// ─── Secret persistence ───────────────────────────────────────────────────────

/** Persist Gmail tokens and mirror to Python `gmail_oauth.json`. */
function saveGmailIntegrationSecrets(ud, secrets) {
  const saved = storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_GMAIL, secrets);
  if (saved.ok) google.syncGmailOAuthMirrorFromSecrets(secrets);
  return saved;
}

function saveDriveIntegrationSecrets(ud, secrets) {
  return storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_DRIVE, secrets);
}

function saveDropboxSecrets(ud, secrets) {
  return storage.saveProviderSecrets(ud, PROVIDER_DROPBOX, secrets);
}

// ─── Migration / hydration ────────────────────────────────────────────────────

/**
 * Older builds stored one `google` row. Copy into Gmail + Drive slots so users
 * can disconnect one service and sign into a different account for the other.
 */
function migrateLegacyGoogleProvider(ud) {
  const legacy = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_LEGACY);
  if (!googleSessionLooksUsable(legacy)) return;
  const gmail = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_GMAIL);
  const drive = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_DRIVE);
  if (!googleSessionLooksUsable(gmail)) {
    storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_GMAIL, legacy);
    google.syncGmailOAuthMirrorFromSecrets(legacy);
  }
  if (!googleSessionLooksUsable(drive)) {
    storage.saveProviderSecrets(ud, PROVIDER_GOOGLE_DRIVE, legacy);
  }
  storage.clearProvider(ud, PROVIDER_GOOGLE_LEGACY);
}

/**
 * If the encrypted store has no Gmail session but `gmail_oauth.json` does,
 * copy tokens in so the renderer Gmail card matches the backend session.
 */
function tryHydrateGoogleGmailFromMirror(ud) {
  const cur = storage.loadProviderSecrets(ud, PROVIDER_GOOGLE_GMAIL);
  if (googleSessionLooksUsable(cur)) return;

  const clientId = google.getClientId();
  if (!clientId) return;

  const mirrorPath = google.gmailOAuthMirrorPath();
  if (!fs.existsSync(mirrorPath)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(mirrorPath, "utf8"));
  } catch {
    return;
  }

  const rt = typeof raw.refresh_token === "string" ? raw.refresh_token.trim() : "";
  if (!rt) return;

  const fileCid = typeof raw.client_id === "string" ? raw.client_id.trim() : "";
  if (fileCid && fileCid !== clientId) return;

  const at = typeof raw.access_token === "string" ? raw.access_token : "";
  const obtainedSec = typeof raw.obtained_at === "number" ? raw.obtained_at : 0;
  const expiresIn =
    typeof raw.expires_in === "number" && raw.expires_in > 0 ? raw.expires_in : 3600;
  const expiresAt =
    obtainedSec > 0
      ? Math.round(obtainedSec * 1000 + expiresIn * 1000)
      : Date.now() + expiresIn * 1000;

  saveGmailIntegrationSecrets(ud, {
    access_token: at,
    refresh_token: rt,
    expires_at: expiresAt,
  });
}

// ─── Provider catalog helpers ─────────────────────────────────────────────────

function oauthConfiguredForProvider(id) {
  if (id === PROVIDER_GOOGLE_GMAIL || id === PROVIDER_GOOGLE_DRIVE || id === PROVIDER_GOOGLE_CALENDAR) {
    return Boolean(google.getClientId());
  }
  if (id === PROVIDER_MICROSOFT || id === PROVIDER_ONEDRIVE || id === PROVIDER_OUTLOOK) {
    return Boolean(microsoft.getClientId());
  }
  if (id === PROVIDER_DROPBOX) return Boolean(dropbox.getAppKey());
  if (id === PROVIDER_NOTION) return Boolean(notion.getClientId() && notion.getClientSecret());
  if (id === PROVIDER_SLACK) return Boolean(slack.getClientId() && slack.getClientSecret());
  // S3 and iCloud use credential / local-folder approach — always "configured"
  if (id === PROVIDER_S3 || id === PROVIDER_ICLOUD || id === PROVIDER_WHATSAPP) return true;
  if (id === PROVIDER_INFOMANIAK || id === PROVIDER_INFOMANIAK_CALENDAR) {
    return infomaniak.infomaniakAuthConfigured();
  }
  return false;
}

function buildProvidersList() {
  return PROVIDER_DEFINITIONS.map((def) => ({
    id: def.id,
    displayName: def.displayName,
    capabilities: def.capabilities,
    capabilityLabels: def.capabilityLabels,
    scopesSummary: def.scopesSummary,
    clientIdEnvVar: def.clientIdEnvVar,
    dashboardUrl: def.dashboardUrl,
    dashboardLabel: def.dashboardLabel,
    oauthConfigured: oauthConfiguredForProvider(def.id),
  }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Provider ID constants
  PROVIDER_GOOGLE_LEGACY,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_GOOGLE_DRIVE,
  PROVIDER_MICROSOFT,
  PROVIDER_ONEDRIVE,
  PROVIDER_DROPBOX,
  PROVIDER_OUTLOOK,
  PROVIDER_NOTION,
  PROVIDER_S3,
  PROVIDER_SLACK,
  PROVIDER_WHATSAPP,
  PROVIDER_ICLOUD,
  PROVIDER_INFOMANIAK,
  PROVIDER_GOOGLE_CALENDAR,
  PROVIDER_GOOGLE_ALL,
  PROVIDER_INFOMANIAK_CALENDAR,
  PROVIDER_INFOMANIAK_ALL,
  // Utilities
  userData,
  infomaniakEnvOpts,
  resolveStagingDir,
  // Session ensurers
  ensureGoogleSession,
  ensureMicrosoftSession,
  ensureDropboxSession,
  ensureNotionSession,
  ensureSlackSession,
  ensureInfomaniakSession,
  ensureInfomaniakCalendarSession,
  // Secret persistence
  saveGmailIntegrationSecrets,
  saveDriveIntegrationSecrets,
  saveDropboxSecrets,
  // Migrators (consumed by systemCommandHandlers.js via ipc.js re-exports)
  migrateLegacyGoogleProvider,
  tryHydrateGoogleGmailFromMirror,
  // Session predicates (consumed by systemCommandHandlers.js via ipc.js re-exports)
  googleSessionLooksUsable,
  microsoftSessionLooksUsable,
  dropboxSessionLooksUsable,
  // Provider catalog
  buildProvidersList,
};
