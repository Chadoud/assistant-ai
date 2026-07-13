/** First-run setup window: launch app and OCR consent promises. */

const { ipcMain } = require("electron");
const state = require("../state");
const { launchMainApp } = require("../windows");

function registerSetupHandlers() {
  ipcMain.handle("setup:launchApp", () => launchMainApp());

  ipcMain.handle("setup:confirmOcr", (_event, accepted) => {
    if (state._ocrConfirmResolve) {
      state._ocrConfirmResolve(accepted);
      state._ocrConfirmResolve = null;
    }
  });

  ipcMain.handle("setup:retryOcr", () => {
    if (state._ocrRetryResolve) {
      state._ocrRetryResolve();
      state._ocrRetryResolve = null;
    }
  });
}

module.exports = { registerSetupHandlers };
