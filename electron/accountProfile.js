/**
 * Per-account local profiles (offline-capable).
 *
 * DEVICE root: app.getPath("userData") — cloud_session, active_profile, updater cache, …
 * PROFILE root: userData/profiles/<id>/ — secrets, DBs (via EXOSITES_*), integrations, sync key, …
 *
 * Backend spawn must set EXOSITES_USER_DATA + EXOSITES_DATA_DIR to resolveProfileRoot().
 */

const fs = require("fs");
const path = require("path");

const GUEST_ID = "guest";
const PROFILES_DIR = "profiles";
const ACTIVE_FILE = "active_profile.json";
const MIGRATE_MARKER = "profile_migrate_v1.json";

/** Files that live under the active profile root (migrate + wipe). */
const PROFILE_FILES = [
  "integration_accounts_v1.json",
  "gmail_oauth.json",
  "sync_master_key.enc",
  "sync_prefs.json",
  "sync_runs.jsonl",
  "entitlement.json",
  "trial.json",
  "sort_credentials_meta.json",
  "backend-env-overrides.json",
  ".env",
  "authorized_paths_v1.json",
  "whatsapp_cloud_sync.json",
  "notion-oauth-client.enc",
  "notion-oauth-client.b64",
  "slack-oauth-client.enc",
  "slack-oauth-client.b64",
  "infomaniak-api-token.enc",
  "infomaniak-api-token.b64",
  // SQLite / backend stores when DATA_DIR = userData (legacy flat + profile)
  "conversations.sqlite",
  "assistant_memory.sqlite",
  "memory.sqlite",
  "tasks.sqlite",
  "digests.sqlite",
  "nudges.sqlite",
  "meetings.sqlite",
  "telemetry.sqlite",
  "activity.sqlite",
  "orchestrator.sqlite",
  "whatsapp_events.sqlite",
];

/** Directories under the active profile root. */
const PROFILE_DIRS = [
  "settings_secrets_v1",
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

/** Staging dirs under the profile root (migrate/wipe + integration allowlists). */
const PROFILE_STAGING_DIRS = PROFILE_DIRS.filter((name) => name !== "settings_secrets_v1");

/** @type {((info: { activeId: string, profileRoot: string }) => void) | null} */
let _onChanged = null;

/**
 * @param {(info: { activeId: string, profileRoot: string }) => void} fn
 */
function setProfileChangeListener(fn) {
  _onChanged = typeof fn === "function" ? fn : null;
}

/**
 * Notify listeners of the current active profile (e.g. after wipe when id unchanged).
 * @param {string} [deviceRoot]
 */
function notifyProfileChanged(deviceRoot) {
  if (!_onChanged) return;
  const state = getProfileState(deviceRoot);
  try {
    _onChanged({ activeId: state.activeId, profileRoot: state.profileRoot });
  } catch {
    /* ignore */
  }
}

function deviceUserDataRoot() {
  try {
    return require("electron").app.getPath("userData");
  } catch {
    return "";
  }
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitizeProfileId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s === GUEST_ID) return GUEST_ID;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(s)) return null;
  return s;
}

/**
 * Decode JWT payload without verify (account id = `sub`).
 * @param {string|null|undefined} accessToken
 * @returns {string|null}
 */
function accountIdFromAccessToken(accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json);
    return sanitizeProfileId(payload && payload.sub);
  } catch {
    return null;
  }
}

/**
 * @param {string} [deviceRoot]
 */
function activeProfilePath(deviceRoot) {
  return path.join(deviceRoot || deviceUserDataRoot(), ACTIVE_FILE);
}

/**
 * @param {string} [deviceRoot]
 * @returns {string}
 */
function getActiveProfileId(deviceRoot) {
  const root = deviceRoot || deviceUserDataRoot();
  if (!root) return GUEST_ID;
  try {
    const p = activeProfilePath(root);
    if (!fs.existsSync(p)) return GUEST_ID;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return sanitizeProfileId(raw && raw.activeId) || GUEST_ID;
  } catch {
    return GUEST_ID;
  }
}

/**
 * @param {string} [deviceRoot]
 * @param {string} [profileId]
 */
function resolveProfileRoot(deviceRoot, profileId) {
  const root = deviceRoot || deviceUserDataRoot();
  const id = sanitizeProfileId(profileId != null ? profileId : getActiveProfileId(root)) || GUEST_ID;
  return path.join(root, PROFILES_DIR, id);
}

/**
 * @param {string} deviceRoot
 * @param {string} profileId
 * @param {{ skipNotify?: boolean }} [opts]
 */
function setActiveProfileId(deviceRoot, profileId, opts = {}) {
  const root = deviceRoot || deviceUserDataRoot();
  const id = sanitizeProfileId(profileId) || GUEST_ID;
  if (!root) return { ok: false, reason: "no_user_data" };
  const profileRoot = path.join(root, PROFILES_DIR, id);
  fs.mkdirSync(profileRoot, { recursive: true });
  fs.writeFileSync(
    activeProfilePath(root),
    JSON.stringify({ v: 1, activeId: id, updatedAt: Date.now() }, null, 2),
    "utf8"
  );
  if (!opts.skipNotify && _onChanged) {
    try {
      _onChanged({ activeId: id, profileRoot });
    } catch {
      /* ignore */
    }
  }
  return { ok: true, activeId: id, profileRoot };
}

/**
 * @param {string} deviceRoot
 * @param {string} src
 * @param {string} dest
 */
function movePath(deviceRoot, src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    // Prefer keeping existing profile data; remove leftover flat copy.
    try {
      const st = fs.statSync(src);
      if (st.isDirectory()) fs.rmSync(src, { recursive: true, force: true });
      else fs.unlinkSync(src);
    } catch {
      /* ignore */
    }
    return false;
  }
  try {
    fs.renameSync(src, dest);
    return true;
  } catch {
    // Cross-device rename fallback
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    }
    return true;
  }
}

/**
 * One-time migrate flat userData PROFILE artifacts into profiles/<accountId>/.
 * @param {string} deviceRoot
 * @param {string} accountId
 */
function migrateLegacyFlatToProfile(deviceRoot, accountId) {
  const root = deviceRoot || deviceUserDataRoot();
  const id = sanitizeProfileId(accountId);
  if (!root || !id || id === GUEST_ID) {
    return { ok: false, reason: "invalid_account", moved: [] };
  }
  const marker = path.join(root, MIGRATE_MARKER);
  if (fs.existsSync(marker)) {
    return { ok: true, skipped: true, moved: [] };
  }
  const destRoot = path.join(root, PROFILES_DIR, id);
  fs.mkdirSync(destRoot, { recursive: true });
  const moved = [];
  for (const name of PROFILE_FILES) {
    const src = path.join(root, name);
    const dest = path.join(destRoot, name);
    if (movePath(root, src, dest)) moved.push(name);
  }
  for (const name of PROFILE_DIRS) {
    const src = path.join(root, name);
    const dest = path.join(destRoot, name);
    if (movePath(root, src, dest)) moved.push(`${name}/`);
  }
  // Also move any leftover *.sqlite at flat root
  try {
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".sqlite")) continue;
      if (PROFILE_FILES.includes(ent.name)) continue;
      const src = path.join(root, ent.name);
      const dest = path.join(destRoot, ent.name);
      if (movePath(root, src, dest)) moved.push(ent.name);
    }
  } catch {
    /* ignore */
  }
  fs.writeFileSync(
    marker,
    JSON.stringify(
      {
        v: 1,
        migratedAt: Date.now(),
        intoProfileId: id,
        moved,
      },
      null,
      2
    ),
    "utf8"
  );
  return { ok: true, skipped: false, moved };
}

/**
 * Activate profile for a signed-in account (migrate once, set active).
 * @param {string} deviceRoot
 * @param {string} accountId
 */
function activateAccountProfile(deviceRoot, accountId) {
  const id = sanitizeProfileId(accountId);
  if (!id || id === GUEST_ID) {
    return { ok: false, reason: "invalid_account" };
  }
  const migrate = migrateLegacyFlatToProfile(deviceRoot, id);
  const set = setActiveProfileId(deviceRoot, id);
  return { ...set, migrate };
}

/**
 * Guest vault must never retain prior account secrets after sign-out.
 * @param {string} profileRoot
 */
function clearProfileSecretsDir(profileRoot) {
  if (!profileRoot) return;
  const secretsDir = path.join(profileRoot, "settings_secrets_v1");
  try {
    if (fs.existsSync(secretsDir)) {
      fs.rmSync(secretsDir, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} [deviceRoot]
 */
function activateGuestProfile(deviceRoot) {
  const root = deviceRoot || deviceUserDataRoot();
  const result = setActiveProfileId(root, GUEST_ID);
  if (result.ok && result.profileRoot) {
    clearProfileSecretsDir(result.profileRoot);
  }
  return result;
}

/**
 * @param {string} [deviceRoot]
 */
function wipeActiveProfile(deviceRoot) {
  const root = deviceRoot || deviceUserDataRoot();
  const id = getActiveProfileId(root);
  const profileRoot = resolveProfileRoot(root, id);
  const removed = [];
  try {
    if (fs.existsSync(profileRoot)) {
      fs.rmSync(profileRoot, { recursive: true, force: true });
      removed.push(`profiles/${id}/`);
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), removed };
  }
  fs.mkdirSync(profileRoot, { recursive: true });
  // Same activeId, empty vault — still wake renderer so secrets/chats rehydrate.
  notifyProfileChanged(root);
  return { ok: true, removed, activeId: id };
}

/**
 * @param {string} [deviceRoot]
 */
function wipeAllProfiles(deviceRoot) {
  const root = deviceRoot || deviceUserDataRoot();
  const removed = [];
  const profilesPath = path.join(root, PROFILES_DIR);
  try {
    if (fs.existsSync(profilesPath)) {
      fs.rmSync(profilesPath, { recursive: true, force: true });
      removed.push(`${PROFILES_DIR}/`);
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), removed };
  }
  try {
    const marker = path.join(root, MIGRATE_MARKER);
    if (fs.existsSync(marker)) {
      fs.unlinkSync(marker);
      removed.push(MIGRATE_MARKER);
    }
  } catch {
    /* ignore */
  }
  setActiveProfileId(root, GUEST_ID, { skipNotify: true });
  return { ok: true, removed };
}

/**
 * @param {string} [deviceRoot]
 */
function getProfileState(deviceRoot) {
  const root = deviceRoot || deviceUserDataRoot();
  const activeId = getActiveProfileId(root);
  return {
    activeId,
    isGuest: activeId === GUEST_ID,
    profileRoot: resolveProfileRoot(root, activeId),
    deviceRoot: root,
  };
}

/**
 * Split device root (session) vs profile root (secrets/DBs).
 * @param {string} [deviceRootHint] usually app.getPath("userData") or test temp dir
 */
function splitRoots(deviceRootHint) {
  const deviceRoot = deviceRootHint || deviceUserDataRoot();
  return {
    deviceRoot,
    profileRoot: resolveProfileRoot(deviceRoot),
  };
}

/**
 * Align active profile with the cloud session (or guest when signed out).
 * Fail closed: missing/invalid account id → guest (never keep prior vault).
 * @param {string} [deviceRoot]
 * @param {{ access_token?: string, account_id?: string } | null} [session]
 */
function alignProfileWithSession(deviceRoot, session) {
  const root = deviceRoot || deviceUserDataRoot();
  const token = session && session.access_token;
  if (!token) {
    return activateGuestProfile(root);
  }
  const fromJwt = accountIdFromAccessToken(token);
  const fromField = sanitizeProfileId(session && session.account_id);
  const id = fromJwt || fromField;
  if (!id || id === GUEST_ID) {
    return activateGuestProfile(root);
  }
  return activateAccountProfile(root, id);
}

module.exports = {
  GUEST_ID,
  PROFILES_DIR,
  PROFILE_FILES,
  PROFILE_DIRS,
  PROFILE_STAGING_DIRS,
  deviceUserDataRoot,
  sanitizeProfileId,
  accountIdFromAccessToken,
  getActiveProfileId,
  resolveProfileRoot,
  setActiveProfileId,
  migrateLegacyFlatToProfile,
  activateAccountProfile,
  activateGuestProfile,
  wipeActiveProfile,
  wipeAllProfiles,
  getProfileState,
  splitRoots,
  alignProfileWithSession,
  setProfileChangeListener,
  notifyProfileChanged,
};
