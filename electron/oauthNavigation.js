/**
 * Navigation allowlist for the desktop OAuth popup (Google / Apple via api.exosites.ch).
 */

const GOOGLE_HOSTS = new Set([
  "accounts.google.com",
  "accounts.google.ch",
  "oauth2.googleapis.com",
]);

const APPLE_HOSTS = new Set([
  "appleid.apple.com",
  "idmsa.apple.com",
]);

/**
 * @param {string} cloudBaseUrl e.g. https://api.exosites.ch
 * @param {string} rawUrl
 * @param {"google" | "apple"} provider
 */
function isTrustedOAuthNavigationUrl(cloudBaseUrl, rawUrl, provider) {
  if (!rawUrl || rawUrl === "about:blank") return true;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  let apiHost;
  try {
    apiHost = new URL(cloudBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (host === apiHost) return true;
  if (provider === "google" && GOOGLE_HOSTS.has(host)) return true;
  if (provider === "apple" && APPLE_HOSTS.has(host)) return true;
  return false;
}

/**
 * @param {string} cloudBaseUrl
 * @param {string} rawUrl
 * @returns {{ ok: true; code: string } | { ok: false; error: string } | null}
 */
function parseAuthDoneCallback(cloudBaseUrl, rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  let apiHost;
  try {
    apiHost = new URL(cloudBaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== apiHost) return null;
  if (parsed.pathname !== "/auth/done") return null;

  const code = parsed.searchParams.get("exo_code");
  const error = parsed.searchParams.get("error");
  if (code) return { ok: true, code };
  return { ok: false, error: error || "signin_failed" };
}

module.exports = {
  isTrustedOAuthNavigationUrl,
  parseAuthDoneCallback,
};
