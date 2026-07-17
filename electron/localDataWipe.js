/**
 * Delete local Electron artifacts after backend wipe / privacy erase.
 * PROFILE data lives under profiles/<id>/; DEVICE session stays at userData root unless wipeAll.
 */

const fs = require("fs");
const path = require("path");
const {
  deviceUserDataRoot,
  wipeActiveProfile,
  wipeAllProfiles,
  resolveProfileRoot,
  GUEST_ID,
} = require("./accountProfile");

/** DEVICE-root files cleared only on wipe-all (or explicit session clear). */
const DEVICE_WIPE_FILES = [
  "cloud_session.json",
  "cloud_session_prefs.json",
  "beta_prefs.json",
  "renderer-diagnostics.log",
  "telemetry-offline-queue.json",
  "system-command-audit.log",
  "update-feed-cache.json",
];

/**
 * Wipe the active profile vault (secrets, sync key, integrations, staging, …).
 * @param {string} [userData] device userData root
 */
function wipeElectronUserDataFiles(userData) {
  const deviceRoot = userData || deviceUserDataRoot();
  if (!deviceRoot || typeof deviceRoot !== "string") {
    return { ok: false, reason: "invalid_user_data" };
  }
  return wipeActiveProfile(deviceRoot);
}

/**
 * Wipe every local account vault + device session/prefs.
 * @param {string} [userData]
 */
function wipeAllElectronProfiles(userData) {
  const deviceRoot = userData || deviceUserDataRoot();
  if (!deviceRoot || typeof deviceRoot !== "string") {
    return { ok: false, reason: "invalid_user_data" };
  }
  const profiles = wipeAllProfiles(deviceRoot);
  if (!profiles.ok) return profiles;
  const removed = [...(profiles.removed || [])];
  for (const name of DEVICE_WIPE_FILES) {
    const target = path.join(deviceRoot, name);
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        removed.push(name);
      }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), removed };
    }
  }
  // Legacy flat leftovers (pre-migrate)
  try {
    const secretsDir = path.join(deviceRoot, "settings_secrets_v1");
    if (fs.existsSync(secretsDir)) {
      fs.rmSync(secretsDir, { recursive: true, force: true });
      removed.push("settings_secrets_v1/");
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), removed };
  }
  return { ok: true, removed };
}

/**
 * @deprecated Use wipeElectronUserDataFiles — kept for tests expecting WIPE_FILES shape.
 */
const WIPE_FILES = [
  "sync_prefs.json",
  "sync_master_key.enc",
  "integration_accounts_v1.json",
  "entitlement.json",
  "settings_secrets_v1/",
];

module.exports = {
  wipeElectronUserDataFiles,
  wipeAllElectronProfiles,
  WIPE_FILES,
  DEVICE_WIPE_FILES,
  resolveProfileRoot,
  GUEST_ID,
};
