/** shell.* and image preview data URLs for the renderer. */

const path = require("path");
const fs = require("fs");
const { BrowserWindow, ipcMain, shell } = require("electron");
const { isAuthorizedFolder } = require("../authorizedPaths");

/** Schemes allowed through shell.openExternal (anything else is rejected). */
const SAFE_EXTERNAL_SCHEMES = new Set(["https:", "mailto:"]);
/** Loopback hosts for which plain http is allowed (codegen preview dev servers). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Whether a parsed URL may be handed to the OS browser. */
function isOpenableExternalUrl(parsed) {
  if (SAFE_EXTERNAL_SCHEMES.has(parsed.protocol)) return true;
  // Plain http is only permitted for local dev servers (e.g. Codegen Studio preview).
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) return true;
  return false;
}

/** Gmail OAuth: in-app window so we know when the user closes it (system browser cannot). */
let gmailOAuthWindow = null;

/** Local image preview in renderer (data URL); dev server cannot load file:// in <img>. */
const PREVIEW_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PREVIEW_IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
]);

function registerShellHandlers() {
  ipcMain.handle("shell:openPath", async (_event, targetPath) => {
    if (typeof targetPath !== "string" || !targetPath.trim()) {
      return "Invalid path";
    }
    const resolved = path.resolve(targetPath.trim());
    if (!isAuthorizedFolder(resolved)) {
      console.warn("[shell:openPath] rejected (not authorized):", resolved.slice(0, 160));
      return "Path is not in an authorized location";
    }
    return shell.openPath(resolved);
  });

  ipcMain.handle("shell:openExternal", async (_event, targetUrl) => {
    let parsed;
    try { parsed = new URL(targetUrl); } catch { return; }
    if (!isOpenableExternalUrl(parsed)) return;
    await shell.openExternal(targetUrl);
  });

  /**
   * Opens Google OAuth in an app-owned window; resolves when that window is closed.
   * Lets the renderer abort the backend wait without shell.openExternal (no close signal).
   */
  ipcMain.handle("shell:openGmailOAuthWindow", async (_event, targetUrl) => {
    if (typeof targetUrl !== "string" || !targetUrl.startsWith("https://accounts.google.com/")) {
      throw new Error("Invalid Gmail OAuth URL");
    }
    if (gmailOAuthWindow && !gmailOAuthWindow.isDestroyed()) {
      gmailOAuthWindow.destroy();
      gmailOAuthWindow = null;
    }
    return await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        gmailOAuthWindow = null;
        resolve(undefined);
      };
      gmailOAuthWindow = new BrowserWindow({
        width: 520,
        height: 720,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          // Remote Google OAuth page — no preload, run sandboxed.
          sandbox: true,
        },
      });
      gmailOAuthWindow.once("closed", finish);
      gmailOAuthWindow.loadURL(targetUrl).catch((err) => {
        console.error("[main] shell:openGmailOAuthWindow loadURL", err);
        if (gmailOAuthWindow && !gmailOAuthWindow.isDestroyed()) {
          gmailOAuthWindow.destroy();
        } else {
          finish();
        }
      });
    });
  });

  ipcMain.handle("shell:showInFolder", (_event, filePath) => {
    if (typeof filePath !== "string" || !filePath.trim()) return;
    const resolved = path.resolve(filePath.trim());
    if (!isAuthorizedFolder(resolved)) return;
    shell.showItemInFolder(resolved);
  });

  ipcMain.handle("preview:imageDataUrl", async (_event, filePath) => {
    try {
      if (typeof filePath !== "string" || !filePath.trim()) return null;
      const resolved = path.resolve(filePath.trim());
      if (!isAuthorizedFolder(resolved)) return null;
      let st;
      try {
        st = await fs.promises.stat(resolved);
      } catch {
        return null;
      }
      if (!st.isFile()) return null;
      const ext = path.extname(resolved).toLowerCase();
      if (!PREVIEW_IMAGE_EXT.has(ext)) return null;
      if (st.size > PREVIEW_IMAGE_MAX_BYTES) return { error: "too_large" };
      const buf = await fs.promises.readFile(resolved);
      const mime =
        ext === ".png"
          ? "image/png"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".bmp"
                ? "image/bmp"
                : ext === ".avif"
                  ? "image/avif"
                  : "image/jpeg";
      return { dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    } catch (err) {
      console.error("[main] preview:imageDataUrl", err);
      return { error: "read_failed" };
    }
  });
}

module.exports = { registerShellHandlers };
