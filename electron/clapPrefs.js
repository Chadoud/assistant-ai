/**
 * Clap-to-launch preferences and OS auto-start wiring.
 *
 * Persists the user's opt-in in userData/clap_prefs.json and keeps the OS login item
 * in sync: when enabled, the app is registered to start at login in a hidden background
 * mode (see CLAP_BACKGROUND_ARG) so a double-clap can bring it forward even after a reboot.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { IS_MAC } = require("./constants");

/** CLI flag the login item passes so main.js starts hidden instead of showing the window. */
const CLAP_BACKGROUND_ARG = "--clap-background";

function prefsPath() {
  return path.join(app.getPath("userData"), "clap_prefs.json");
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/** Whether clap-to-launch is enabled. Default false (opt-in — it keeps the mic listening). */
function getClapToLaunchEnabled() {
  const d = readJsonSafe(prefsPath(), { enabled: false });
  return d.enabled === true;
}

function writeClapToLaunchEnabled(enabled) {
  const p = prefsPath();
  const prev = readJsonSafe(p, {});
  const next = { ...prev, enabled: Boolean(enabled) };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
}

/**
 * Register or clear the OS login item. No-op in dev (unpackaged) since the dev binary
 * path is Electron itself, not the installed app — registering it would be misleading.
 */
function syncLoginItem(enabled) {
  if (!app.isPackaged) return;
  try {
    if (IS_MAC) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        openAsHidden: Boolean(enabled),
        args: enabled ? [CLAP_BACKGROUND_ARG] : [],
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        args: enabled ? [CLAP_BACKGROUND_ARG] : [],
      });
    }
  } catch (err) {
    console.warn("[clapPrefs] setLoginItemSettings failed:", err);
  }
}

/** Persist the opt-in and bring the OS login item in line with it. */
function setClapToLaunchEnabled(enabled) {
  writeClapToLaunchEnabled(enabled);
  syncLoginItem(enabled);
}

/** True when this process was started by the login item in background mode. */
function launchedAsClapBackground() {
  return process.argv.includes(CLAP_BACKGROUND_ARG);
}

module.exports = {
  CLAP_BACKGROUND_ARG,
  getClapToLaunchEnabled,
  setClapToLaunchEnabled,
  syncLoginItem,
  launchedAsClapBackground,
};
