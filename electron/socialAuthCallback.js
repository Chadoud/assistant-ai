/**
 * Receives exo://auth/callback?exo_code=… from the system browser after cloud OAuth.
 * Google/Apple block embedded Electron windows; the user's browser shows account chooser.
 */

const { app } = require("electron");

const PROTOCOL = "exo";
const CALLBACK_HOST = "auth";
const CALLBACK_PATH = "/callback";
/** How long to keep an early exo:// URL until the desktop waiter starts. */
const BUFFER_TTL_MS = 3 * 60 * 1000;

/** @type {{ resolve: (v: { ok: true; code: string } | { ok: false; error: string }) => void; timer: NodeJS.Timeout } | null} */
let pending = null;
/** @type {string | null} */
let bufferedCallbackUrl = null;
/** @type {number} */
let bufferedAt = 0;

/**
 * @param {string} rawUrl
 * @returns {{ ok: true; code: string } | { ok: false; error: string } | null}
 */
function parseExoAuthCallbackUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return null;
  if (parsed.hostname !== CALLBACK_HOST) return null;
  if (parsed.pathname !== CALLBACK_PATH && parsed.pathname !== `${CALLBACK_PATH}/`) return null;

  const code = parsed.searchParams.get("exo_code");
  const error = parsed.searchParams.get("error");
  if (code) return { ok: true, code };
  return { ok: false, error: error || "signin_failed" };
}

function clearBufferedUrl() {
  bufferedCallbackUrl = null;
  bufferedAt = 0;
}

/** @param {string} rawUrl */
function bufferCallbackUrl(rawUrl) {
  bufferedCallbackUrl = rawUrl;
  bufferedAt = Date.now();
}

/** @returns {string | null} */
function takeBufferedCallbackUrl() {
  if (!bufferedCallbackUrl) return null;
  if (Date.now() - bufferedAt > BUFFER_TTL_MS) {
    clearBufferedUrl();
    return null;
  }
  const url = bufferedCallbackUrl;
  clearBufferedUrl();
  return url;
}

function settlePending(result) {
  clearBufferedUrl();
  if (!pending) return;
  clearTimeout(pending.timer);
  const { resolve } = pending;
  pending = null;
  resolve(result);
}

/**
 * @param {string} rawUrl
 * @returns {boolean}
 */
function handleSocialAuthCallbackUrl(rawUrl) {
  const parsed = parseExoAuthCallbackUrl(rawUrl);
  if (!parsed) return false;
  if (pending) {
    settlePending(parsed);
  } else {
    bufferCallbackUrl(rawUrl);
    console.log("[socialAuth] buffered exo:// callback (no active waiter yet)");
  }
  return true;
}

/**
 * macOS may deliver exo:// on cold start via argv before the OAuth waiter exists.
 */
function ingestArgvProtocolUrls() {
  for (const arg of process.argv) {
    if (typeof arg === "string" && arg.startsWith(`${PROTOCOL}://`)) {
      handleSocialAuthCallbackUrl(arg);
    }
  }
}

/**
 * Register exo:// handler (call once from main before OAuth).
 */
function registerSocialAuthProtocol() {
  if (process.defaultApp) {
    const path = require("path");
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
  ingestArgvProtocolUrls();
}

/**
 * Wait for the browser to redirect to exo://auth/callback after social sign-in.
 * @param {number} [timeoutMs]
 */
function waitForSocialAuthCallback(timeoutMs = 5 * 60 * 1000) {
  if (pending) {
    return Promise.reject(new Error("social_auth_already_pending"));
  }

  const buffered = takeBufferedCallbackUrl();
  if (buffered) {
    const parsed = parseExoAuthCallbackUrl(buffered);
    if (parsed) {
      console.log("[socialAuth] replaying buffered exo:// callback");
      return Promise.resolve(parsed);
    }
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending = null;
      resolve({ ok: false, error: "timeout" });
    }, timeoutMs);
    pending = { resolve, timer };
  });
}

function cancelPendingSocialAuth() {
  if (!pending) return;
  settlePending({ ok: false, error: "cancelled" });
}

module.exports = {
  parseExoAuthCallbackUrl,
  handleSocialAuthCallbackUrl,
  registerSocialAuthProtocol,
  waitForSocialAuthCallback,
  cancelPendingSocialAuth,
  ingestArgvProtocolUrls,
};
