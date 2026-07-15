/**
 * Last line of defense for the Electron MAIN process.
 *
 * The renderer already captures its own errors (window handlers → crash DB / Sentry),
 * but uncaught errors in the main process would otherwise be invisible: no toast, no DB
 * row, and potentially a silently broken app. This module:
 *
 *   1. Starts Electron's native crash reporter so C++/V8 hard crashes leave a local minidump.
 *   2. Catches `uncaughtException` / `unhandledRejection`, logs them to the diagnostics file,
 *      and relays them to the renderer — which owns the opt-in-respecting crash-DB pipeline.
 *   3. Shows a throttled, friendly dialog so the user isn't left staring at a frozen UI.
 *
 * It never re-throws and never force-quits: a single stray rejection shouldn't kill the app.
 */

const { app, dialog, crashReporter } = require("electron");
const state = require("./state");
const { APP_NAME } = require("./constants");
const { appendMainDiagnosticLine, getRendererDiagnosticsLogPath } = require("./rendererDiagnostics");

const DIALOG_THROTTLE_MS = 10000;
let lastDialogAt = 0;
let installed = false;

/** Reduce any thrown value to a `{ message, stack }` pair safe to log and relay. */
function normalizeError(value) {
  if (value instanceof Error) {
    return {
      message: String(value.message || value.name || "Error").slice(0, 8000),
      stack: typeof value.stack === "string" ? value.stack.slice(0, 65000) : null,
    };
  }
  return { message: String(value).slice(0, 8000), stack: null };
}

/** Relay to the renderer so it can report (respecting the user's Privacy opt-in) and toast. */
function relayToRenderer(kind, normalized) {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send("main-process-error", {
      kind,
      message: normalized.message,
      stack: normalized.stack,
    });
  } catch {
    /* renderer not ready — local log already has it */
  }
}

function maybeShowDialog(normalized) {
  const now = Date.now();
  if (now - lastDialogAt < DIALOG_THROTTLE_MS) return;
  lastDialogAt = now;

  const win = state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : null;
  const logPath = getRendererDiagnosticsLogPath() || "(unknown path)";
  const options = {
    type: "error",
    title: APP_NAME,
    message: "A background error occurred",
    detail: `${normalized.message}\n\nThe app is still running. A diagnostic log was saved to:\n${logPath}`,
    buttons: ["Continue", "Reload window"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const handle = (result) => {
    const response = typeof result === "object" && result ? result.response : result;
    if (response === 1 && win) {
      try {
        win.reload();
      } catch {
        /* ignore */
      }
    }
  };
  try {
    if (win) {
      void dialog.showMessageBox(win, options).then(handle);
    } else {
      void dialog.showMessageBox(options).then(handle);
    }
  } catch {
    /* dialog unavailable (very early startup) */
  }
}

function handle(kind, value) {
  const normalized = normalizeError(value);
  appendMainDiagnosticLine({ event: kind, message: normalized.message, stack: normalized.stack });
  // eslint-disable-next-line no-console
  console.error(`[main-diagnostics] ${kind}:`, normalized.message);
  try {
    const { deleteMaterializedGmailOAuthMirror } = require("./gmailOAuthMirrorStore");
    deleteMaterializedGmailOAuthMirror(app.getPath("userData"));
  } catch {
    /* best-effort wipe of ephemeral gmail mirror (M2.4) */
  }
  relayToRenderer(kind, normalized);
  maybeShowDialog(normalized);
}

/**
 * Install main-process crash guards. Safe to call once, early in startup.
 */
function installMainProcessGuards() {
  if (installed) return;
  installed = true;

  try {
    // Local minidumps only — no upload server is configured, so nothing leaves the device.
    crashReporter.start({
      productName: APP_NAME,
      companyName: APP_NAME,
      submitURL: "",
      uploadToServer: false,
      compress: true,
    });
  } catch (err) {
    console.warn("[main-diagnostics] crashReporter.start failed:", err);
  }

  process.on("uncaughtException", (error) => handle("uncaughtException", error));
  process.on("unhandledRejection", (reason) => handle("unhandledRejection", reason));

  app.on("child-process-gone", (_event, details) => {
    appendMainDiagnosticLine({
      event: "child-process-gone",
      type: details?.type,
      reason: details?.reason,
      exitCode: details?.exitCode,
    });
  });
}

module.exports = { installMainProcessGuards, normalizeError };
