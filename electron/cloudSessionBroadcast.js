const { BrowserWindow } = require("electron");

/** Notify all renderer windows that cloud sign-in state may have changed. */
function broadcastCloudSessionChanged(reason) {
  const payload = { reason: typeof reason === "string" ? reason : "changed" };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("cloud-session:changed", payload);
    }
  }
}

module.exports = { broadcastCloudSessionChanged };
