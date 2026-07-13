/** In-process Prometheus-style counters for the cloud API. */

const startedAtMs = Date.now();

/** @type {Map<string, number>} */
const httpRequestsTotal = new Map();

/**
 * @param {string} method
 * @param {string} path
 * @param {number} status
 */
function recordHttpRequest(method, status, path) {
  const safePath = String(path || "/").slice(0, 120);
  const key = `${String(method || "GET").toUpperCase()}|${safePath}|${status}`;
  httpRequestsTotal.set(key, (httpRequestsTotal.get(key) || 0) + 1);
}

function uptimeSeconds() {
  return Math.floor((Date.now() - startedAtMs) / 1000);
}

function prometheusText() {
  const lines = [
    "# HELP exo_cloud_uptime_seconds Cloud API process uptime.",
    "# TYPE exo_cloud_uptime_seconds gauge",
    `exo_cloud_uptime_seconds ${uptimeSeconds()}`,
    "# HELP exo_cloud_http_requests_total HTTP requests handled by this process.",
    "# TYPE exo_cloud_http_requests_total counter",
  ];
  for (const [key, count] of httpRequestsTotal.entries()) {
    const [method, path, status] = key.split("|");
    lines.push(
      `exo_cloud_http_requests_total{method="${method}",path="${escapeLabel(path)}",status="${status}"} ${count}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/** @param {string} value */
function escapeLabel(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Express middleware — increments counters on response finish.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function metricsMiddleware(req, res, next) {
  res.on("finish", () => {
    recordHttpRequest(req.method, res.statusCode, req.path);
  });
  next();
}

module.exports = {
  metricsMiddleware,
  prometheusText,
  recordHttpRequest,
  uptimeSeconds,
};
