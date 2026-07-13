/** Main-process telemetry queue (offline batch to local API + cloud mirror). */

const { ipcMain, app } = require("electron");
const telemetryQueue = require("../telemetryQueue");
const { syncFeedback } = require("../telemetryCloudSync");
const { BACKEND_PORT } = require("../constants");
const state = require("../state");

async function postLocalFeedback(bodyStr) {
  const headers = { "Content-Type": "application/json" };
  if (state.appToken) headers["X-App-Token"] = state.appToken;
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/telemetry/feedback`, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  return res.ok;
}

function registerTelemetryHandlers() {
  ipcMain.handle("telemetry:sendBatch", async (_event, url, bodyStr) => {
    return telemetryQueue.sendOrQueue(url, bodyStr);
  });

  ipcMain.handle("telemetry:flushOffline", async () => {
    await telemetryQueue.drain();
    return { ok: true };
  });

  ipcMain.handle("telemetry:submitFeedback", async (_event, bodyStr) => {
    if (typeof bodyStr !== "string") return false;
    try {
      const localOk = await postLocalFeedback(bodyStr);
      syncFeedback(bodyStr);
      return localOk;
    } catch {
      return false;
    }
  });

  app.whenReady().then(() => {
    telemetryQueue.startPeriodicDrain();
  });
}

module.exports = { registerTelemetryHandlers };
