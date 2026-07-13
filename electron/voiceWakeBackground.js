/**
 * Clap-to-launch: optional login item + tray when started hidden at boot.
 * Closing the main window quits the app (see main.js window-all-closed).
 */

const path = require("path");
const fs = require("fs");
const { Tray, Menu, app } = require("electron");
const state = require("./state");
const { APP_NAME, IS_WIN } = require("./constants");

let tray = null;

function trayIconPath() {
  const icon = IS_WIN
    ? path.join(__dirname, "assets", "icon-win.png")
    : path.join(__dirname, "assets", "icon.png");
  return fs.existsSync(icon) ? icon : null;
}

/** Show, restore and focus the main window if it exists. Hides the tray while visible. */
function showMainWindow() {
  const w = state.mainWindow;
  if (!w || w.isDestroyed()) return;
  if (w.isMinimized()) w.restore();
  try {
    w.setSkipTaskbar(false);
  } catch {
    /* ignore */
  }
  if (!w.isVisible()) w.show();
  w.focus();
  destroyTray();
}

function destroyTray() {
  if (tray) {
    try {
      tray.destroy();
    } catch {
      /* ignore */
    }
    tray = null;
  }
}

function ensureTray() {
  if (tray) return;
  const iconPath = trayIconPath();
  if (!iconPath) {
    console.warn("[voiceWakeBackground] tray icon missing, skipping tray");
    return;
  }
  tray = new Tray(iconPath);
  tray.setToolTip(`${APP_NAME} — clap twice to open`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open", click: () => showMainWindow() },
      { type: "separator" },
      {
        label: "Quit completely",
        click: () => {
          state.isAppQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showMainWindow());
}

/**
 * Closing the main window must fully exit — users expect the menu bar app name to disappear.
 * Clap-to-launch still works while the app is open/minimized and via the login item at boot.
 * @param {import("electron").BrowserWindow} _win
 */
function attachMainWindowCloseHandler(_win) {
  /* no hide-to-tray on close */
}

/**
 * Toggle background mode (synced from the renderer when clap-to-launch changes).
 * The tray icon is created only when the window is hidden to the tray — not while
 * the app is open in the foreground (see attachMainWindowCloseHandler / startHidden).
 * @param {boolean} enabled
 */
function setClapToLaunchMode(enabled) {
  state.clapToLaunchMode = Boolean(enabled);
  if (!state.clapToLaunchMode) {
    destroyTray();
    showMainWindow();
  }
}

function registerAppLifecycleHooks() {
  app.on("before-quit", () => {
    state.isAppQuitting = true;
    destroyTray();
  });
}

module.exports = {
  attachMainWindowCloseHandler,
  ensureTray,
  destroyTray,
  showMainWindow,
  setClapToLaunchMode,
  registerAppLifecycleHooks,
};
