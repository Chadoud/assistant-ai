/** Clap-to-launch settings IPC: read state and toggle opt-in (persist + login item + tray). */

const { ipcMain } = require("electron");
const { getClapToLaunchEnabled, setClapToLaunchEnabled } = require("../clapPrefs");
const { setClapToLaunchMode } = require("../voiceWakeBackground");

function registerClapHandlers() {
  ipcMain.handle("clap:getSettings", () => ({
    enabled: getClapToLaunchEnabled(),
    /** Clap-to-launch relies on the desktop shell (tray, login item), so it's desktop-only. */
    supported: true,
  }));

  ipcMain.handle("clap:setEnabled", (_event, enabled) => {
    const next = Boolean(enabled);
    try {
      setClapToLaunchEnabled(next);
      setClapToLaunchMode(next);
      return { ok: true, enabled: next };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });
}

module.exports = { registerClapHandlers };
