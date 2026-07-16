/**
 * HTTPS feed fetch with size cap, optional validators (ETag / Last-Modified).
 */

const https = require("https");

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 64_000;

/**
 * @param {string} url
 * @param {{
 *   etag?: string|null,
 *   lastModified?: string|null,
 *   timeoutMs?: number,
 *   maxBytes?: number,
 *   get?: typeof https.get,
 * }} [opts]
 * @returns {Promise<{
 *   status: number,
 *   feed: object|null,
 *   etag: string|null,
 *   lastModified: string|null,
 *   notModified: boolean,
 * }>}
 */
function fetchFeed(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const get = opts.get || https.get;

  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {};
    if (opts.etag) headers["If-None-Match"] = String(opts.etag);
    if (opts.lastModified) headers["If-Modified-Since"] = String(opts.lastModified);

    const req = get(url, { timeout: timeoutMs, headers }, (res) => {
      const status = res.statusCode || 0;
      const etag =
        typeof res.headers.etag === "string" && res.headers.etag.trim()
          ? res.headers.etag.trim()
          : null;
      const lastModified =
        typeof res.headers["last-modified"] === "string" && res.headers["last-modified"].trim()
          ? res.headers["last-modified"].trim()
          : null;

      if (status === 304) {
        res.resume();
        resolve({ status: 304, feed: null, etag: etag || opts.etag || null, lastModified: lastModified || opts.lastModified || null, notModified: true });
        return;
      }

      if (status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > maxBytes) {
          req.destroy(new Error("response too large"));
        }
      });
      res.on("end", () => {
        try {
          const feed = JSON.parse(raw);
          resolve({ status, feed, etag, lastModified, notModified: false });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

module.exports = { fetchFeed, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_BYTES };
