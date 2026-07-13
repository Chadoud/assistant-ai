/**
 * Logs renderer-process failures and offers recovery when the window goes black (OOM, GPU, crash).
 * Appends JSON lines to userData/renderer-diagnostics.log
 */

const fs = require("fs");
const path = require("path");
const { app, dialog } = require("electron");
const { APP_NAME } = require("./constants");

const LOG_NAME = "renderer-diagnostics.log";
/** Cap log size so long-running installs do not grow userData without bound. */
const MAX_LOG_BYTES = 512 * 1024;
const TRIM_KEEP_LINES = 2000;

function trimDiagnosticsLogIfOversized(logPath) {
  if (!logPath) return;
  try {
    const stat = fs.statSync(logPath);
    if (stat.size <= MAX_LOG_BYTES) return;
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const kept = lines.slice(-TRIM_KEEP_LINES);
    fs.writeFileSync(logPath, kept.join("\n") + "\n", "utf8");
  } catch (e) {
    console.error("[renderer-diagnostics] trim failed", e);
  }
}

function getRendererDiagnosticsLogPath() {
  try {
    return path.join(app.getPath("userData"), LOG_NAME);
  } catch {
    return null;
  }
}

function appendRawLine(obj) {
  const line = typeof obj === "string" ? obj : JSON.stringify({ t: new Date().toISOString(), ...obj });
  const p = getRendererDiagnosticsLogPath();
  if (!p) return;
  try {
    trimDiagnosticsLogIfOversized(p);
    fs.appendFileSync(p, line + "\n", "utf8");
  } catch (e) {
    console.error("[renderer-diagnostics] append failed", e);
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
function appendRendererDiagnosticLine(payload) {
  appendRawLine({ source: "renderer", ...payload });
}

/**
 * @param {Record<string, unknown>} payload
 */
function appendMainDiagnosticLine(payload) {
  appendRawLine({ source: "main", ...payload });
}

let lastGoneAt = 0;

/**
 * @param {import("electron").BrowserWindow} win
 * @param {{ label?: string }} [opts]
 */
function attachRendererLifecycleDiagnostics(win, opts = {}) {
  const label = typeof opts.label === "string" ? opts.label : "main";
  const wc = win.webContents;

  wc.on("render-process-gone", async (_event, details) => {
    if (Date.now() - lastGoneAt < 500) return;
    lastGoneAt = Date.now();
    let url = "";
    try {
      url = wc.getURL() || "";
    } catch {
      /* ignore */
    }
    const entry = {
      event: "render-process-gone",
      label,
      reason: details?.reason,
      exitCode: details?.exitCode,
      url: url.length > 400 ? url.slice(0, 400) + "…" : url,
    };
    appendRawLine(entry);
    console.error("[renderer-diagnostics]", entry);
    if (win.isDestroyed()) return;
    const logPath = getRendererDiagnosticsLogPath() || "(unknown path)";
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: "error",
        title: `${APP_NAME}`,
        message: "The app window display stopped",
        detail: `The UI process ended (${details?.reason || "unknown"}). This often happens after many files load or when memory is low.\n\nA log was saved to:\n${logPath}\n\nReload the window?`,
        buttons: ["Reload", "Quit app"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0 && !win.isDestroyed()) {
        win.reload();
        return;
      }
      if (response === 1) {
        app.quit();
      }
    } catch (e) {
      console.error("[renderer-diagnostics] dialog failed", e);
    }
  });

  wc.on("unresponsive", () => {
    let url = "";
    try {
      url = wc.getURL() || "";
    } catch {
      /* ignore */
    }
    appendRawLine({
      event: "unresponsive",
      label,
      url: url.length > 200 ? url.slice(0, 200) + "…" : url,
    });
    console.warn("[renderer-diagnostics] unresponsive", label);
  });

  wc.on("responsive", () => {
    appendRawLine({ event: "responsive", label });
  });
}

module.exports = {
  getRendererDiagnosticsLogPath,
  appendRendererDiagnosticLine,
  appendMainDiagnosticLine,
  attachRendererLifecycleDiagnostics,
  trimDiagnosticsLogIfOversized,
  MAX_LOG_BYTES,
  TRIM_KEEP_LINES,
};
