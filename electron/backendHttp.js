/**
 * Authenticated HTTP calls from the Electron main process to the local backend.
 * Also backs renderer `backend:http` IPC so the app token never enters the renderer (M2.3).
 */

const state = require("./state");
const { BACKEND_PORT } = require("./constants");

/**
 * @param {string} pathPath path + query, e.g. `/v1/privacy/wipe-local`
 * @param {{ method?: string; body?: unknown; headers?: Record<string, string>; rawBody?: Buffer | string; contentType?: string }} [options]
 * @returns {Promise<{ ok: boolean; status: number; data: unknown; text: string; contentType: string }>}
 */
async function backendFetch(pathPath, options = {}) {
  const method = options.method || "GET";
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const token = state.appToken || "";
  if (token) headers["X-App-Token"] = token;

  let body;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    if (options.contentType) headers["Content-Type"] = options.contentType;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const pathOnly = String(pathPath || "");
  if (!pathOnly.startsWith("/")) {
    throw new Error("backend path must be absolute on the local API");
  }

  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}${pathOnly}`, {
    method,
    headers,
    body,
  });

  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  return { ok: res.ok, status: res.status, data, text, contentType };
}

module.exports = { backendFetch };
