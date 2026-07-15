/**
 * In-app update flow.
 *
 * Trigger (all platforms): a small `latest.json` published next to the installers on
 * the website. "Releasing" = upload the new installer + bump latest.json. This is the
 * single source of truth for "is there a newer version?", so it works regardless of how
 * each platform is packaged.
 *
 * Action:
 *   - macOS: real in-app self-update via electron-updater (generic feed = same folder).
 *     The renderer drives download + restart and shows live byte progress.
 *   - Windows: the renderer opens the website download page (the Windows build ships via
 *     Inno Setup, which electron-updater cannot self-update — a redirect is the honest UX).
 *
 * Integrity (M1c): packaged clients require a valid Ed25519 `sig` on latest.json.
 * Mac self-update additionally requires the running app to be Developer ID–signed.
 *
 * Defensive by design: missing feed / offline / bad signature / dev build must never
 * throw or block startup.
 */

const { ipcMain, shell, app } = require("electron");
const https = require("https");
const state = require("./state");
const { compareVersions } = require("./updateFeed/canonical");
const { verifyUpdateFeed } = require("./updateFeed/verify");
const { isDeveloperIdSigned } = require("./updateFeed/isDeveloperIdSigned");

const FEED_BASE = (
  process.env.EXOSITES_UPDATE_FEED_URL || "https://exosites.ch/downloads/exo-assistant"
).replace(/\/$/, "");
const LATEST_JSON_URL = `${FEED_BASE}/latest.json`;
const DOWNLOAD_PAGE_URL =
  process.env.EXOSITES_DOWNLOAD_PAGE_URL ||
  "https://exosites.ch/eng/projects/exo-ai";

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** Brief pause so the UI can show "Restarting…" before quitAndInstall. */
const AUTO_INSTALL_DELAY_MS = 2000;

let started = false;
let macUpdater = null;
let autoInstallTimer = null;
/** Cached Developer ID check for the running .app (packaged Mac only). */
let runningAppDeveloperIdSigned = null;

/**
 * Latest snapshot the renderer can read on mount (events may fire before the UI exists).
 * @type {{ status: string, version: string|null, notes: string|null, canSelfUpdate: boolean, downloadUrl: string|null, progress: number|null, error: string|null }}
 */
let lastState = {
  status: "idle",
  version: null,
  notes: null,
  canSelfUpdate: false,
  downloadUrl: null,
  progress: null,
  error: null,
};

function sendToRenderer(channel, payload) {
  const win = state.mainWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function clearAutoInstallTimer() {
  if (autoInstallTimer) {
    clearTimeout(autoInstallTimer);
    autoInstallTimer = null;
  }
}

/** Quit, apply the downloaded update, and relaunch (macOS packaged builds only). */
function quitAndInstallUpdate() {
  if (!macUpdater) return false;
  try {
    macUpdater.quitAndInstall(false, true);
    return true;
  } catch (err) {
    const message = (err && err.message) || "Install failed";
    console.warn("[updater] quitAndInstall failed:", message);
    setState({ status: "error", error: message });
    sendToRenderer("update:error", { message });
    return false;
  }
}

/** After download completes, relaunch automatically so users run the new build without an extra click. */
function scheduleAutoInstall() {
  if (!lastState.canSelfUpdate || !macUpdater) return;
  if (autoInstallTimer) return;
  setState({ status: "installing", progress: 100 });
  sendToRenderer("update:installing", { version: lastState.version });
  autoInstallTimer = setTimeout(() => {
    autoInstallTimer = null;
    quitAndInstallUpdate();
  }, AUTO_INSTALL_DELAY_MS);
}

function setState(patch) {
  lastState = { ...lastState, ...patch };
}

function isMac() {
  return process.platform === "darwin";
}

function ensureRunningAppDeveloperIdSigned() {
  if (runningAppDeveloperIdSigned != null) return runningAppDeveloperIdSigned;
  if (!isMac() || !app.isPackaged) {
    runningAppDeveloperIdSigned = false;
    return false;
  }
  runningAppDeveloperIdSigned = isDeveloperIdSigned();
  return runningAppDeveloperIdSigned;
}

/**
 * True only when electron-updater loaded AND the running Mac app is Developer ID–signed.
 * Unsigned packaged builds must not self-update (fail closed).
 */
function canSelfUpdateMac() {
  return (
    isMac() &&
    app.isPackaged &&
    macUpdater != null &&
    ensureRunningAppDeveloperIdSigned()
  );
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode && res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 64_000) {
          req.destroy(new Error("response too large"));
        }
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** Pick the platform-specific download URL from latest.json, falling back to the page. */
function downloadUrlFor(feed) {
  const key = isMac() ? "mac" : "windows";
  const url = feed && typeof feed[key] === "string" ? feed[key].trim() : "";
  return url || DOWNLOAD_PAGE_URL;
}

/**
 * Packaged: require valid sig. Dev: if sig present, verify; if absent, allow (local UI).
 * @param {object} feed
 * @returns {Promise<boolean>}
 */
async function feedSignatureAcceptable(feed) {
  const hasSig = feed && typeof feed.sig === "string" && feed.sig.trim();
  if (app.isPackaged) {
    const v = await verifyUpdateFeed(feed);
    if (!v.ok) {
      console.warn("[updater] latest.json signature rejected:", v.reason || "invalid");
      return false;
    }
    return true;
  }
  if (!hasSig) return true;
  const v = await verifyUpdateFeed(feed);
  if (!v.ok) {
    console.warn("[updater] latest.json signature rejected (dev):", v.reason || "invalid");
    return false;
  }
  return true;
}

async function checkLatestJson() {
  setState({ status: "checking", error: null });
  let feed;
  try {
    feed = await fetchJson(LATEST_JSON_URL);
  } catch (err) {
    // Offline / no feed yet — not an error worth surfacing to the user.
    setState({ status: "idle", error: null });
    return;
  }

  if (!(await feedSignatureAcceptable(feed))) {
    setState({ status: "idle", error: null });
    return;
  }

  const remoteVersion = feed && typeof feed.version === "string" ? feed.version.trim() : "";
  if (!remoteVersion) {
    setState({ status: "idle" });
    return;
  }

  const current = app.getVersion();
  if (compareVersions(remoteVersion, current) <= 0) {
    setState({ status: "up-to-date", version: remoteVersion });
    return;
  }

  setState({
    status: "available",
    version: remoteVersion,
    notes: typeof feed.notes === "string" ? feed.notes : null,
    canSelfUpdate: canSelfUpdateMac(),
    downloadUrl: downloadUrlFor(feed),
    progress: null,
    error: null,
  });
  sendToRenderer("update:available", {
    version: lastState.version,
    notes: lastState.notes,
    canSelfUpdate: lastState.canSelfUpdate,
    downloadUrl: lastState.downloadUrl,
  });
}

function setupMacUpdater() {
  if (!isMac() || !app.isPackaged) return;
  try {
    ({ autoUpdater: macUpdater } = require("electron-updater"));
  } catch (err) {
    console.warn("[updater] electron-updater unavailable:", err && err.message);
    macUpdater = null;
    return;
  }

  macUpdater.autoDownload = false;
  macUpdater.autoInstallOnAppQuit = true;
  try {
    macUpdater.setFeedURL({ provider: "generic", url: FEED_BASE });
  } catch (err) {
    console.warn("[updater] setFeedURL failed:", err && err.message);
  }

  if (!ensureRunningAppDeveloperIdSigned()) {
    console.warn(
      "[updater] running app is not Developer ID–signed — Mac self-update disabled"
    );
  }

  macUpdater.on("download-progress", (p) => {
    const percent = Math.max(0, Math.min(100, Math.round(p.percent || 0)));
    setState({ status: "downloading", progress: percent });
    sendToRenderer("update:progress", {
      percent,
      transferred: p.transferred || 0,
      total: p.total || 0,
      bytesPerSecond: p.bytesPerSecond || 0,
    });
  });
  macUpdater.on("update-downloaded", (info) => {
    setState({ status: "downloaded", progress: 100, version: info && info.version });
    sendToRenderer("update:downloaded", { version: info && info.version });
    scheduleAutoInstall();
  });
  macUpdater.on("error", (err) => {
    const message = (err && err.message) || "Update failed";
    setState({ status: "error", error: message });
    sendToRenderer("update:error", { message });
  });
}

/**
 * Start the update checks. Safe to call unconditionally.
 * @param {import("electron").App} _app
 */
function initAutoUpdates(_app) {
  if (started) return;
  started = true;

  setupMacUpdater();

  // Dev convenience: simulate an available update so the modal can be exercised.
  if (!app.isPackaged && process.env.EXOSITES_UPDATE_DEV_SIMULATE === "1") {
    setState({
      status: "available",
      version: `${app.getVersion()}-dev+1`,
      notes: "Simulated update for local UI testing.",
      canSelfUpdate: false,
      downloadUrl: DOWNLOAD_PAGE_URL,
    });
    setTimeout(() => {
      sendToRenderer("update:available", {
        version: lastState.version,
        notes: lastState.notes,
        canSelfUpdate: lastState.canSelfUpdate,
        downloadUrl: lastState.downloadUrl,
      });
    }, 4000);
    return;
  }

  void checkLatestJson();
  setInterval(() => void checkLatestJson(), RECHECK_INTERVAL_MS).unref();
}

function registerUpdateHandlers() {
  ipcMain.handle("update:getState", () => lastState);

  ipcMain.handle("update:check", async () => {
    await checkLatestJson();
    return { ok: true, status: lastState.status };
  });

  ipcMain.handle("update:start", async () => {
    if (isMac() && app.isPackaged && macUpdater && !ensureRunningAppDeveloperIdSigned()) {
      const message =
        "This build is not Developer ID–signed; in-app update is disabled.";
      setState({ status: "error", error: message });
      sendToRenderer("update:error", { message });
      return { ok: false, mode: "download", reason: message };
    }

    if (lastState.canSelfUpdate && macUpdater) {
      try {
        setState({ status: "downloading", progress: 0 });
        // electron-updater must read latest-mac.yml before downloadUpdate() can run.
        const checkResult = await macUpdater.checkForUpdates();
        if (!checkResult?.updateInfo) {
          throw new Error("Update package not found on the feed");
        }
        await macUpdater.downloadUpdate();
        return { ok: true, mode: "download" };
      } catch (err) {
        const message = (err && err.message) || "Download failed";
        setState({ status: "error", error: message });
        sendToRenderer("update:error", { message });
        return { ok: false, mode: "download", reason: message };
      }
    }
    const url = lastState.downloadUrl || DOWNLOAD_PAGE_URL;
    await shell.openExternal(url);
    return { ok: true, mode: "redirect", url };
  });

  ipcMain.handle("update:install", () => {
    if (lastState.canSelfUpdate && macUpdater) {
      clearAutoInstallTimer();
      setImmediate(() => quitAndInstallUpdate());
      return { ok: true };
    }
    return { ok: false, reason: "self_update_unavailable" };
  });
}

module.exports = { initAutoUpdates, registerUpdateHandlers };
