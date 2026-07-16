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
 * Defensive by design: missing feed / offline / bad signature / missing crypto / dev build
 * must never throw or block startup. Fail closed for updates; fail open for the product.
 */

const fs = require("fs");
const path = require("path");
const { ipcMain, shell, app } = require("electron");
const state = require("./state");
const { compareVersions } = require("./updateFeed/canonical");
const { verifyUpdateFeed } = require("./updateFeed/verify");
const { isDeveloperIdSigned } = require("./updateFeed/isDeveloperIdSigned");
const { fetchFeed } = require("./autoUpdater/fetchFeed");
const {
  nextBackoffMs,
  withJitter,
  applyFeedToState,
} = require("./autoUpdater/helpers");

const FEED_BASE = (
  process.env.EXOSITES_UPDATE_FEED_URL || "https://exosites.ch/downloads/exo-assistant"
).replace(/\/$/, "");
const LATEST_JSON_URL = `${FEED_BASE}/latest.json`;
const DOWNLOAD_PAGE_URL =
  process.env.EXOSITES_DOWNLOAD_PAGE_URL ||
  "https://exosites.ch/eng/projects/exo-ai";

const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 30_000;
/** Retry interval while first-launch setup window is still open. */
const SETUP_RETRY_MS = 60_000;
/** Brief pause so the UI can show "Restarting…" before quitAndInstall. */
const AUTO_INSTALL_DELAY_MS = 2000;

let started = false;
let macUpdater = null;
let autoInstallTimer = null;
let scheduleTimer = null;
/** Cached Developer ID check for the running .app (packaged Mac only). */
let runningAppDeveloperIdSigned = null;

/** In-flight check promise for dedupe (manual + scheduled join the same work). */
let checkPromise = null;
/** Consecutive check failures; success resets to 0. */
let failCount = 0;
/** Cached validators for conditional GET. */
let feedCache = { etag: null, lastModified: null };

/**
 * Latest snapshot the renderer can read on mount (events may fire before the UI exists).
 * status: idle | checking | up-to-date | available | downloading | downloaded | installing | error
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

function clearScheduleTimer() {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
}

function feedCachePath() {
  try {
    return path.join(app.getPath("userData"), "update-feed-cache.json");
  } catch {
    return null;
  }
}

function loadFeedCacheFromDisk() {
  const p = feedCachePath();
  if (!p) return;
  try {
    if (!fs.existsSync(p)) return;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (raw && typeof raw === "object") {
      feedCache = {
        etag: typeof raw.etag === "string" ? raw.etag : null,
        lastModified: typeof raw.lastModified === "string" ? raw.lastModified : null,
      };
    }
  } catch {
    /* ignore corrupt cache */
  }
}

function persistFeedCache() {
  const p = feedCachePath();
  if (!p) return;
  try {
    fs.writeFileSync(
      p,
      JSON.stringify({
        etag: feedCache.etag,
        lastModified: feedCache.lastModified,
        savedAt: Date.now(),
      }),
      "utf8"
    );
  } catch {
    /* best-effort */
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

function setupWindowActive() {
  return Boolean(state.setupWindow && !state.setupWindow.isDestroyed());
}

function mainWindowReady() {
  return Boolean(state.mainWindow && !state.mainWindow.isDestroyed());
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

/** Pick the platform-specific download URL from latest.json, falling back to the page. */
function downloadUrlFor(feed) {
  const key = isMac() ? "mac" : "windows";
  const url = feed && typeof feed[key] === "string" ? feed[key].trim() : "";
  return url || DOWNLOAD_PAGE_URL;
}

/**
 * Packaged: require valid sig. Dev: if sig present, verify; if absent, allow (local UI).
 * Never throws.
 * @param {object} feed
 * @returns {Promise<boolean>}
 */
async function feedSignatureAcceptable(feed) {
  try {
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
  } catch (err) {
    console.warn("[updater] signature check failed:", err && err.message);
    return false;
  }
}

/**
 * @param {number} baseMs
 * @param {string} label
 */
function armSchedule(baseMs, label) {
  clearScheduleTimer();
  const delay = withJitter(baseMs);
  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    void checkLatestJson({ reason: "schedule" }).catch((err) => {
      console.warn("[updater] scheduled check failed:", err && err.message);
    });
  }, delay);
  try {
    scheduleTimer.unref?.();
  } catch {
    /* ignore */
  }
  console.warn(`[updater] next check in ${delay}ms (${label} failCount=${failCount})`);
}

/**
 * Schedule the next automatic check. Success → 6h + jitter; failure → backoff + jitter.
 * @param {"success"|"failure"|"setup"} outcome
 */
function scheduleNextCheck(outcome) {
  if (outcome === "setup") {
    armSchedule(SETUP_RETRY_MS, "outcome=setup");
    return;
  }
  const baseMs =
    outcome === "success" ? RECHECK_INTERVAL_MS : nextBackoffMs(failCount);
  armSchedule(baseMs, `outcome=${outcome}`);
}

/**
 * @param {{ manual?: boolean, reason?: string }} [opts]
 */
async function checkLatestJsonInner(opts = {}) {
  const reason = opts.reason || (opts.manual ? "manual" : "auto");

  // During first-launch setup, skip automatic checks (manual still runs).
  if (!opts.manual && setupWindowActive()) {
    console.warn(`[updater] check result=skipped reason=setup_window`);
    scheduleNextCheck("setup");
    return;
  }

  setState({ status: "checking", error: null });

  let result;
  try {
    result = await fetchFeed(LATEST_JSON_URL, {
      etag: feedCache.etag,
      lastModified: feedCache.lastModified,
    });
  } catch (err) {
    failCount += 1;
    setState({ status: "idle", error: null });
    console.warn(
      `[updater] check result=network_error reason=${reason} message=${err && err.message} backoffMs=${nextBackoffMs(failCount)}`
    );
    scheduleNextCheck("failure");
    return;
  }

  if (result.etag) feedCache.etag = result.etag;
  if (result.lastModified) feedCache.lastModified = result.lastModified;
  persistFeedCache();

  if (result.notModified) {
    failCount = 0;
    if (lastState.status !== "available" && lastState.status !== "downloading" && lastState.status !== "downloaded" && lastState.status !== "installing") {
      setState({ status: "up-to-date", error: null });
    }
    console.warn(`[updater] check result=not_modified reason=${reason} backoffMs=${RECHECK_INTERVAL_MS}`);
    scheduleNextCheck("success");
    return;
  }

  const feed = result.feed;
  if (!(await feedSignatureAcceptable(feed))) {
    failCount += 1;
    setState({ status: "idle", error: null });
    console.warn(
      `[updater] check result=sig_reject reason=${reason} backoffMs=${nextBackoffMs(failCount)}`
    );
    scheduleNextCheck("failure");
    return;
  }

  const applied = applyFeedToState(
    feed,
    app.getVersion(),
    compareVersions,
    canSelfUpdateMac,
    downloadUrlFor
  );

  if (applied.status === "available") {
    failCount = 0;
    setState(applied);
    sendToRenderer("update:available", {
      version: lastState.version,
      notes: lastState.notes,
      canSelfUpdate: lastState.canSelfUpdate,
      downloadUrl: lastState.downloadUrl,
    });
    console.warn(
      `[updater] check result=available reason=${reason} version=${lastState.version} backoffMs=${RECHECK_INTERVAL_MS}`
    );
    scheduleNextCheck("success");
    return;
  }

  failCount = 0;
  setState(applied);
  console.warn(
    `[updater] check result=${applied.status} reason=${reason} backoffMs=${RECHECK_INTERVAL_MS}`
  );
  scheduleNextCheck("success");
}

/**
 * Public check entry — never throws; dedupes concurrent callers.
 * @param {{ manual?: boolean, reason?: string }} [opts]
 */
function checkLatestJson(opts = {}) {
  if (checkPromise) return checkPromise;
  checkPromise = (async () => {
    try {
      await checkLatestJsonInner(opts);
    } catch (err) {
      failCount += 1;
      setState({ status: "idle", error: null });
      console.warn(
        `[updater] check result=unexpected reason=${opts.reason || "auto"} message=${err && err.message} backoffMs=${nextBackoffMs(failCount)}`
      );
      scheduleNextCheck("failure");
    } finally {
      checkPromise = null;
    }
  })();
  return checkPromise;
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
 * Packaged: first check deferred 30s (and skipped while setup window is active).
 * @param {import("electron").App} _app
 */
function initAutoUpdates(_app) {
  if (started) return;
  started = true;

  setupMacUpdater();
  loadFeedCacheFromDisk();

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

  const startChecks = () => {
    void checkLatestJson({ reason: "startup" }).catch((err) => {
      console.warn("[updater] startup check failed:", err && err.message);
    });
  };

  if (app.isPackaged) {
    // Defer until after main UI is up; skip entirely while setup is showing.
    const timer = setTimeout(() => {
      if (setupWindowActive()) {
        console.warn("[updater] deferred check skipped — setup window active");
        scheduleNextCheck("setup");
        return;
      }
      if (!mainWindowReady()) {
        console.warn("[updater] deferred check — main window not ready yet, checking anyway");
      }
      startChecks();
    }, FIRST_CHECK_DELAY_MS);
    try {
      timer.unref?.();
    } catch {
      /* ignore */
    }
  } else {
    startChecks();
  }
}

function registerUpdateHandlers() {
  ipcMain.handle("update:getState", () => lastState);

  ipcMain.handle("update:check", async () => {
    await checkLatestJson({ manual: true, reason: "manual" });
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

module.exports = {
  initAutoUpdates,
  registerUpdateHandlers,
  // Test / diagnostics seams
  checkLatestJson,
  NEXT_BACKOFF: { RECHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS },
};
