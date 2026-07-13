/**
 * Allowlist for Codegen Studio in-app preview URLs (loopback dev servers only).
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PREVIEW_PORT_MIN = 5300;
const PREVIEW_PORT_MAX = 5399;

/**
 * @param {string | null | undefined} urlStr
 * @returns {boolean}
 */
function isAllowedCodegenPreviewUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  let parsed;
  try {
    parsed = new URL(urlStr.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) return false;
  const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === "https:" ? 443 : 80;
  if (!Number.isFinite(port)) return false;
  return port >= PREVIEW_PORT_MIN && port <= PREVIEW_PORT_MAX;
}

module.exports = {
  LOOPBACK_HOSTS,
  PREVIEW_PORT_MIN,
  PREVIEW_PORT_MAX,
  isAllowedCodegenPreviewUrl,
};
