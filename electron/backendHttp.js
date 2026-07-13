/**
 * Authenticated HTTP calls from the Electron main process to the local backend.
 */

const state = require("./state");
const { BACKEND_PORT } = require("./constants");

/**
 * @param {string} pathPath path + query, e.g. `/v1/privacy/wipe-local`
 * @param {{ method?: string; body?: unknown }} [options]
 * @returns {Promise<{ ok: boolean; status: number; data: unknown }>}
 */
async function backendFetch(pathPath, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json" };
  const token = state.appToken || "";
  if (token) headers["X-App-Token"] = token;

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}${pathPath}`, {
    method,
    headers,
    body,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

module.exports = { backendFetch };
