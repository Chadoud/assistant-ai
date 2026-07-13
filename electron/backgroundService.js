/**
 * Background desktop service scaffold — scheduler + sync when main window is closed.
 */

const syncWorker = require("./syncWorker");

let running = false;

function startBackgroundService(userData) {
  if (running) return;
  running = true;
  syncWorker.startSyncWorker(userData);
}

function stopBackgroundService() {
  running = false;
  syncWorker.stopSyncWorker();
}

function isBackgroundRunning() {
  return running;
}

module.exports = { startBackgroundService, stopBackgroundService, isBackgroundRunning };
