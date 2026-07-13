/**
 * Opens cloud social sign-in in the **system browser** (Safari/Chrome) and waits for
 * exo://auth/callback. Google and Apple both require a real browser — embedded Electron
 * windows break Apple Sign In and feel unlike normal OAuth.
 */

const { shell } = require("electron");
const { waitForSocialAuthCallback, cancelPendingSocialAuth } = require("./socialAuthCallback");

/**
 * @param {string} baseUrl cloud API base, e.g. https://api.exosites.ch
 * @param {"google" | "apple"} provider
 * @returns {Promise<{ ok: true; code: string } | { ok: false; error: string }>}
 */
async function runSocialLogin(baseUrl, provider) {
  const waitPromise = waitForSocialAuthCallback().catch((err) => {
    if (err instanceof Error && err.message === "social_auth_already_pending") {
      return { ok: false, error: "social_auth_already_pending" };
    }
    throw err;
  });

  const startUrl = `${baseUrl}/auth/start/${provider}`;

  try {
    await shell.openExternal(startUrl);
  } catch (err) {
    console.error("[socialLogin] openExternal failed:", err && err.message);
    cancelPendingSocialAuth();
    return { ok: false, error: "open_failed" };
  }

  return waitPromise;
}

function cancelSocialLoginWindow() {
  cancelPendingSocialAuth();
}

module.exports = { runSocialLogin, cancelSocialLoginWindow };
