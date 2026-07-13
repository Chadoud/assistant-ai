/** Window chrome, restore/focus. */

const { ipcMain } = require("electron");
const state = require("../state");
const { showMainWindow } = require("../voiceWakeBackground");

function registerWindowHandlers() {
  ipcMain.handle("window:minimize", () => state.mainWindow?.minimize());

  ipcMain.handle("window:maximize", () => {
    if (state.mainWindow?.isMaximized()) state.mainWindow.unmaximize();
    else state.mainWindow?.maximize();
  });

  ipcMain.handle("window:close", () => state.mainWindow?.close());

  ipcMain.handle("window:toggleFullscreen", () => {
    const win = state.mainWindow;
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.handle("window:isFullscreen", () => {
    const win = state.mainWindow;
    if (!win || win.isDestroyed()) return false;
    return win.isFullScreen();
  });

  /**
   * Show, restore from minimized, and focus the main window (e.g. double-clap wake).
   * No-op if the main window is not created yet.
   */
  ipcMain.handle("window:restoreAndFocus", () => {
    const win = state.mainWindow;
    if (!win || win.isDestroyed()) {
      return { ok: false, reason: "no_window" };
    }
    try {
      showMainWindow();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });

  /**
   * When false, Chromium keeps timers/RAF at full rate in background (clap-wake sampling).
   * Visuals must still freeze via ExoVisualBudget — do not use this to keep the tesseract painting.
   */
  ipcMain.handle("window:setBackgroundThrottling", (_event, enabled) => {
    const win = state.mainWindow;
    if (!win || win.isDestroyed()) {
      return { ok: false, reason: "no_window" };
    }
    try {
      win.webContents.setBackgroundThrottling(Boolean(enabled));
      return { ok: true, enabled: Boolean(enabled) };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });

}

module.exports = { registerWindowHandlers };
