/**
 * Persist failed telemetry batches under userData and retry POST from the main process.
 * Prevents silent data loss when the renderer is online but the local API is briefly down.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const state = require("./state");
const { syncEventsBatch } = require("./telemetryCloudSync");

const QUEUE_FILENAME = "telemetry-offline-queue.json";
const MAX_QUEUED = 100;
const DRAIN_INTERVAL_MS = 60_000;

/** @type {ReturnType<typeof setInterval> | null} */
let drainTimer = null;
/** @type {Promise<void> | null} */
let drainChain = null;

/**
 * Only same-origin-ish local API — avoids queuing arbitrary URLs if the renderer were compromised.
 * @param {string} url
 */
function isAllowedTelemetryUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h !== "127.0.0.1" && h !== "localhost") return false;
    const p = u.pathname.replace(/\/$/, "");
    return p.endsWith("/v1/telemetry/events");
  } catch {
    return false;
  }
}

function queuePath() {
  return path.join(app.getPath("userData"), QUEUE_FILENAME);
}

/** @returns {{ url: string, body: string }[]} */
function readQueue() {
  try {
    const p = queuePath();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x) =>
        x &&
        typeof x.url === "string" &&
        typeof x.body === "string" &&
        isAllowedTelemetryUrl(x.url)
    );
  } catch {
    return [];
  }
}

/** @param {{ url: string, body: string }[]} items */
function writeQueue(items) {
  try {
    fs.writeFileSync(queuePath(), JSON.stringify(items), "utf8");
  } catch (err) {
    console.error("[telemetryQueue] write failed:", err);
  }
}

/**
 * @param {string} url
 * @param {string} bodyStr
 */
function append(url, bodyStr) {
  const items = readQueue();
  items.push({ url, body: bodyStr });
  while (items.length > MAX_QUEUED) items.shift();
  writeQueue(items);
}

/**
 * @param {string} url
 * @param {string} bodyStr
 * @returns {Promise<boolean>}
 */
async function tryPost(url, bodyStr) {
  const headers = { "Content-Type": "application/json" };
  // Include the per-run shared secret so the backend middleware accepts this request.
  if (state.appToken) headers["X-App-Token"] = state.appToken;
  const res = await fetch(url, { method: "POST", headers, body: bodyStr });
  return res.ok;
}

async function drainOnce() {
  const items = readQueue();
  if (items.length === 0) return;
  const remaining = [];
  for (const item of items) {
    try {
      const ok = await tryPost(item.url, item.body);
      if (ok) {
        syncEventsBatch(item.body);
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

function drain() {
  if (drainChain) return drainChain;
  drainChain = drainOnce().finally(() => {
    drainChain = null;
  });
  return drainChain;
}

/**
 * @param {string} url
 * @param {string} bodyStr
 * @returns {Promise<{ ok: boolean, delivered?: boolean, queued?: boolean, reason?: string }>}
 */
async function sendOrQueue(url, bodyStr) {
  if (typeof url !== "string" || typeof bodyStr !== "string") {
    return { ok: false, reason: "bad_args" };
  }
  if (!isAllowedTelemetryUrl(url)) {
    return { ok: false, reason: "url" };
  }
  // Cloud mirror is independent of local backend availability.
  syncEventsBatch(bodyStr);
  try {
    const ok = await tryPost(url, bodyStr);
    if (ok) {
      void drain();
      return { ok: true, delivered: true };
    }
  } catch (_) {
    /* fall through to queue */
  }
  append(url, bodyStr);
  return { ok: true, delivered: false, queued: true };
}

function startPeriodicDrain() {
  if (drainTimer) return;
  void drain();
  drainTimer = setInterval(() => {
    void drain();
  }, DRAIN_INTERVAL_MS);
}

module.exports = {
  isAllowedTelemetryUrl,
  sendOrQueue,
  drain,
  startPeriodicDrain,
};
