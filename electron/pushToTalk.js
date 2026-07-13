/**
 * Global push-to-talk shortcut (Electron main process).
 * Brings Exo forward and notifies the renderer on accelerator press.
 * Release is handled by in-app keyboard listeners once the window is focused.
 */

const { globalShortcut, BrowserWindow } = require("electron");

/** @type {string | null} */
let registeredAccelerator = null;

function getMainWebContents() {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  return win?.webContents ?? null;
}

function unregisterPushToTalk() {
  if (registeredAccelerator) {
    try {
      globalShortcut.unregister(registeredAccelerator);
    } catch {
      /* ignore */
    }
    registeredAccelerator = null;
  }
}

/** Electron globalShortcut cannot register modifier-only accelerators (e.g. bare "Alt"). */
function isRegisterableGlobalAccelerator(accelerator) {
  const parts = accelerator.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const modifiers = new Set([
    "CommandOrControl",
    "CmdOrCtrl",
    "Command",
    "Control",
    "Ctrl",
    "Alt",
    "Option",
    "Shift",
    "Super",
    "Meta",
  ]);
  return parts.some((part) => !modifiers.has(part));
}

/**
 * Sync global shortcut registration from renderer settings.
 * @param {{ enabled?: boolean, accelerator?: string }} config
 */
function syncPushToTalkConfig(config) {
  unregisterPushToTalk();
  const enabled = Boolean(config?.enabled);
  const accelerator = typeof config?.accelerator === "string" ? config.accelerator.trim() : "";
  if (!enabled || !accelerator) return;
  if (!isRegisterableGlobalAccelerator(accelerator)) {
    console.warn("[pushToTalk] skipping invalid global accelerator:", accelerator);
    return;
  }

  try {
    const ok = globalShortcut.register(accelerator, () => {
      const wc = getMainWebContents();
      if (!wc || wc.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(wc);
      if (win && !win.isDestroyed()) {
        if (win.isFocused()) return;
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
        win.focus();
      }
      wc.send("ptt:keydown");
    });
    if (!ok) {
      console.warn("[pushToTalk] failed to register accelerator:", accelerator);
      return;
    }
    registeredAccelerator = accelerator;
  } catch (err) {
    console.warn("[pushToTalk] register error:", err);
  }
}

function registerPushToTalkHandlers(ipcMain) {
  ipcMain.handle("ptt:setConfig", (_event, config) => {
    syncPushToTalkConfig(config ?? {});
    return { ok: true };
  });

  ipcMain.handle("ptt:unregister", () => {
    unregisterPushToTalk();
    return { ok: true };
  });
}

module.exports = {
  isRegisterableGlobalAccelerator,
  registerPushToTalkHandlers,
  syncPushToTalkConfig,
  unregisterPushToTalk,
};
