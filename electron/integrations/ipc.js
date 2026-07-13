/**
 * IPC facade for third-party integrations (OAuth + token store).
 *
 * This file is the public entry-point: it re-exports symbols consumed by
 * `electron/ipc/systemCommandHandlers.js` and wires up all IPC handlers by
 * delegating to the three submodules in `./ipc/`.
 *
 * Do NOT add business logic here — put session helpers in `integrationCore.js`
 * and handler implementations in the appropriate `register*` module.
 */

const { ipcMain } = require("electron");
const core = require("./ipc/integrationCore");
const registerIntegrationAccountsHandlers = require("./ipc/registerIntegrationAccountsHandlers");
const registerIntegrationOAuthHandlers = require("./ipc/registerIntegrationOAuthHandlers");
const registerIntegrationCloudImportHandlers = require("./ipc/registerIntegrationCloudImportHandlers");

function registerIntegrationHandlers() {
  registerIntegrationAccountsHandlers(ipcMain, core);
  registerIntegrationOAuthHandlers(ipcMain, core);
  registerIntegrationCloudImportHandlers(ipcMain, core);
}

module.exports = {
  registerIntegrationHandlers,

  // ── Re-exports for systemCommandHandlers.js ──────────────────────────────
  // These symbols must remain available at this path to avoid breaking the
  // existing require("../integrations/ipc") in systemCommandHandlers.js.
  migrateLegacyGoogleProvider: core.migrateLegacyGoogleProvider,
  tryHydrateGoogleGmailFromMirror: core.tryHydrateGoogleGmailFromMirror,
  googleSessionLooksUsable: core.googleSessionLooksUsable,
  PROVIDER_GOOGLE_GMAIL: core.PROVIDER_GOOGLE_GMAIL,
  PROVIDER_GOOGLE_DRIVE: core.PROVIDER_GOOGLE_DRIVE,
  PROVIDER_GOOGLE_CALENDAR: core.PROVIDER_GOOGLE_CALENDAR,
  PROVIDER_GOOGLE_ALL: core.PROVIDER_GOOGLE_ALL,
  PROVIDER_INFOMANIAK_CALENDAR: core.PROVIDER_INFOMANIAK_CALENDAR,
  PROVIDER_INFOMANIAK_ALL: core.PROVIDER_INFOMANIAK_ALL,
  PROVIDER_OUTLOOK: core.PROVIDER_OUTLOOK,
};
