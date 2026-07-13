/**
 * IPC handlers for Codegen Studio preview and dev servers.
 */

const { ipcMain, shell, WebContentsView, BrowserWindow } = require("electron");
const path = require("path");
const devServer = require("../codegen/devServerManager");
const { isAllowedCodegenPreviewUrl } = require("../codegen/previewUrlPolicy");
const state = require("../state");
const { isTrustedSender } = require("./senderGuard");

/** @param {import("electron").IpcMainInvokeEvent} event */
function rejectUntrustedCodegen(event) {
  if (!isTrustedSender(event)) {
    return { ok: false, error: "untrusted_sender" };
  }
  return null;
}

/** @type {Map<string, import('electron').WebContentsView>} */
const previewViews = new Map();
/** @type {Map<string, string>} sessionId -> URL last requested for the view. */
const loadedUrls = new Map();
/** @type {Map<string, NodeJS.Timeout>} sessionId -> pending reload retry timer. */
const reloadTimers = new Map();
/** @type {Map<string, number>} sessionId -> consecutive failed-load retry count. */
const reloadAttempts = new Map();

const PREVIEW_RELOAD_RETRY_MS = 1000;
/** Stop retrying a refused/blank preview after this many tries (~20s) to avoid log spam. */
const MAX_PREVIEW_RELOAD_ATTEMPTS = 20;
/** Chromium ERR_ABORTED — a superseded navigation, not a real failure. */
const ERR_ABORTED = -3;

function getMainWindow() {
  return state.mainWindow;
}

/**
 * Convert a renderer-space DOM rect into a clamped window-content rect for the
 * overlay. Multiplying by the zoom factor keeps the overlay aligned when the
 * page is zoomed; clamping prevents the OS-level view from bleeding outside the
 * window (it is not clipped by the React layout).
 */
function toContentBounds(win, bounds) {
  let zoom = 1;
  try {
    zoom = win.webContents.getZoomFactor() || 1;
  } catch {
    zoom = 1;
  }
  const content = win.getContentBounds();
  let x = Math.round(bounds.x * zoom);
  let y = Math.round(bounds.y * zoom);
  let width = Math.round(bounds.width * zoom);
  let height = Math.round(bounds.height * zoom);
  x = Math.max(0, Math.min(x, content.width));
  y = Math.max(0, Math.min(y, content.height));
  width = Math.max(0, Math.min(width, content.width - x));
  height = Math.max(0, Math.min(height, content.height - y));
  return { x, y, width, height };
}

function clearReloadTimer(sessionId) {
  const timer = reloadTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    reloadTimers.delete(sessionId);
  }
}

function schedulePreviewReload(sessionId, view, url) {
  if (reloadTimers.has(sessionId)) return;
  const win = getMainWindow();
  if (!win || win.isDestroyed() || view.webContents.isDestroyed()) return;
  const attempts = reloadAttempts.get(sessionId) ?? 0;
  if (attempts >= MAX_PREVIEW_RELOAD_ATTEMPTS) return;
  reloadAttempts.set(sessionId, attempts + 1);
  const timer = setTimeout(() => {
    reloadTimers.delete(sessionId);
    if (view.webContents.isDestroyed()) return;
    view.webContents.loadURL(url).catch(() => schedulePreviewReload(sessionId, view, url));
  }, PREVIEW_RELOAD_RETRY_MS);
  reloadTimers.set(sessionId, timer);
}

/** Load the URL once per change, retrying transient failures (dev server warm-up). */
function ensurePreviewLoaded(sessionId, view, url) {
  if (loadedUrls.get(sessionId) === url) return;
  loadedUrls.set(sessionId, url);
  reloadAttempts.set(sessionId, 0);
  clearReloadTimer(sessionId);
  view.webContents.loadURL(url).catch(() => schedulePreviewReload(sessionId, view, url));
}

function createPreviewView(sessionId, win, url) {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Generated dev-server content is untrusted; run it fully sandboxed.
      sandbox: true,
    },
  });
  previewViews.set(sessionId, view);
  win.contentView.addChildView(view);
  view.webContents.on("did-fail-load", (_evt, errorCode, _desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED) return;
    const target = loadedUrls.get(sessionId);
    if (target) schedulePreviewReload(sessionId, view, target);
  });
  // Only clear the retry timer on a finished load. Do NOT reset the attempt
  // counter here: Chromium fires did-finish-load for its own error page on
  // ERR_CONNECTION_REFUSED, which previously reset the cap and caused an
  // infinite reload loop. The counter resets only when a new URL is requested.
  view.webContents.on("did-finish-load", () => {
    clearReloadTimer(sessionId);
  });
  ensurePreviewLoaded(sessionId, view, url);
  return view;
}

function registerCodegenHandlers() {
  ipcMain.handle("codegen:runInstall", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    const cwd = String(payload?.cwd || "");
    const command = String(payload?.installCommand || "npm install");
    const skipIfReady = Boolean(payload?.skipIfReady);
    if (!sessionId || !cwd) return { ok: false, error: "sessionId and cwd required" };
    try {
      const result = await devServer.runInstall(sessionId, cwd, command, { skipIfReady });
      return { ok: true, ...result };
    } catch (err) {
      const tail = devServer.getStatus(sessionId).logTail;
      const detail = err.message || String(err);
      return {
        ok: false,
        error: tail ? `${detail}\n\n${tail.slice(-1200)}` : detail,
        logTail: tail,
      };
    }
  });

  ipcMain.handle("codegen:devServerStart", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    const cwd = String(payload?.cwd || "");
    const command = String(payload?.devCommand || "npm run dev");
    const reuseIfRunning = Boolean(payload?.reuseIfRunning);
    if (!sessionId || !cwd) return { ok: false, error: "sessionId and cwd required" };
    try {
      const result = await devServer.startDevServer(sessionId, cwd, command, { reuseIfRunning });
      return { ok: true, ...result };
    } catch (err) {
      const tail = devServer.getStatus(sessionId).logTail;
      const detail = err.message || String(err);
      return {
        ok: false,
        error: tail ? `${detail}\n\n${tail.slice(-1200)}` : detail,
        logTail: tail,
      };
    }
  });

  ipcMain.handle("codegen:devServerStop", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    if (sessionId) devServer.killSession(sessionId);
    hidePreviewView(sessionId);
    return { ok: true };
  });

  ipcMain.handle("codegen:devServerStatus", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    return devServer.getStatus(sessionId);
  });

  ipcMain.handle("codegen:openProjectFolder", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const cwd = String(payload?.path || "");
    if (!devServer.isTrustedStudioPath(cwd)) return { ok: false };
    await shell.openPath(cwd);
    return { ok: true };
  });

  ipcMain.handle("codegen:previewSetBounds", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    const url = String(payload?.url || "");
    const bounds = payload?.bounds;
    const win = getMainWindow();
    if (!win || win.isDestroyed() || !sessionId || !url || !bounds) return { ok: false };
    if (!isAllowedCodegenPreviewUrl(url)) return { ok: false, error: "preview_url_not_allowed" };

    let view = previewViews.get(sessionId);
    if (!view) {
      view = createPreviewView(sessionId, win, url);
    } else {
      ensurePreviewLoaded(sessionId, view, url);
    }

    view.setBounds(toContentBounds(win, bounds));
    return { ok: true };
  });

  ipcMain.handle("codegen:previewHide", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    hidePreviewView(String(payload?.sessionId || ""));
    return { ok: true };
  });

  ipcMain.handle("codegen:previewReload", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    const view = previewViews.get(sessionId);
    if (view && !view.webContents.isDestroyed()) {
      clearReloadTimer(sessionId);
      view.webContents.reload();
    }
    return { ok: true };
  });

  ipcMain.handle("codegen:previewProbe", async (event, payload) => {
    const denied = rejectUntrustedCodegen(event);
    if (denied) return denied;
    const sessionId = String(payload?.sessionId || "");
    const view = previewViews.get(sessionId);
    if (!view || view.webContents.isDestroyed()) {
      return { ok: false, reason: "no_preview", kind: "no_preview" };
    }
    try {
      const probe = await view.webContents.executeJavaScript(PROBE_SCRIPT, true);
      return { ok: !probe.broken, reason: probe.reason || null, kind: probe.kind || null };
    } catch {
      // A probe failure must not block the user — treat as inconclusive.
      return { ok: true, reason: null, kind: "inconclusive" };
    }
  });
}

/**
 * Runs inside the preview page. Distinguishes a Vite error overlay (definitive
 * failure), rendered content (definitive success) and a blank #root (only
 * definitive after the verify window elapses) so the renderer can poll for a
 * real compile verdict instead of guessing from a fixed settle timer.
 */
const PROBE_SCRIPT = `(() => {
  try {
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) {
      const sr = overlay.shadowRoot;
      const msg = ((sr && sr.textContent) || overlay.textContent || 'Vite build error').trim().slice(0, 600);
      return { broken: true, kind: 'overlay', reason: msg };
    }
    const root = document.getElementById('root');
    const text = root ? (root.innerText || '').trim() : '';
    const children = root ? root.childElementCount : 0;
    if (!root || (children === 0 && text.length === 0)) {
      return { broken: true, kind: 'blank', reason: 'The app rendered a blank page (#root is empty).' };
    }
    return { broken: false, kind: 'ok' };
  } catch (e) {
    return { broken: false, kind: 'inconclusive' };
  }
})()`;

function hidePreviewView(sessionId) {
  if (!sessionId) return;
  const win = getMainWindow();
  const view = previewViews.get(sessionId);
  if (view && win && !win.isDestroyed()) {
    try {
      win.contentView.removeChildView(view);
    } catch {
      /* ignore */
    }
  }
  clearReloadTimer(sessionId);
  loadedUrls.delete(sessionId);
  reloadAttempts.delete(sessionId);
  previewViews.delete(sessionId);
}

function detachAllPreviewViews() {
  for (const id of [...previewViews.keys()]) hidePreviewView(id);
}

/**
 * The preview overlay is a native WebContentsView owned by the main process and
 * positioned by renderer React code. A hard renderer reload (Cmd+R or navigation)
 * destroys the React tree WITHOUT running unmount cleanup, so `previewHide` never
 * fires and the overlay is orphaned — it keeps painting on top at its last bounds
 * across every tab. Detach all overlays when the host renderer starts a new load
 * so the fresh renderer starts clean and re-attaches only when it asks to.
 *
 * Only the host window's own webContents is observed here; each preview view has
 * its own webContents, so their loads never trigger this cleanup.
 */
function attachCodegenPreviewHostCleanup(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.on("did-start-loading", detachAllPreviewViews);
}

function cleanupCodegenOnQuit() {
  devServer.killAll();
  detachAllPreviewViews();
}

module.exports = {
  registerCodegenHandlers,
  attachCodegenPreviewHostCleanup,
  cleanupCodegenOnQuit,
};
