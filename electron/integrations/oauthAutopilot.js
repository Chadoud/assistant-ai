/**
 * AI self-connect autopilot entry point.
 *
 * Normally an OAuth flow opens the provider's consent page in the user's browser
 * (`shell.openExternal`) and waits for the human to click "Authorize". With
 * `autopilot`, the AI completes it itself: it launches the user's installed Chrome
 * (via `chromeAutopilot`) and drives the consent page — reading each page, deciding
 * the next action with the backend brain, and clicking — pausing only for human-only
 * gates (sign-in / 2FA / captcha) and resuming automatically afterward.
 *
 * The OAuth callback + token exchange are unchanged: the loopback server still
 * receives the redirect. This module only changes *who clicks the button*.
 */

const { shell } = require("electron");
const { sendProgress } = require("./autopilotCore");
const { launchAndDrive } = require("./chromeAutopilot");
const { launchAndDriveDesktop } = require("./desktopAutopilot");

/**
 * Open an OAuth authorization URL. With `autopilot`, the AI drives the user's
 * installed Chrome; otherwise this behaves like before (`shell.openExternal`).
 * If Chrome can't be launched, it falls back to the default browser for manual
 * completion (the loopback still finishes the connection).
 *
 * @param {string} authUrl
 * @param {{ autopilot?: boolean; providerId: string; label: string; redirectUri: string }} opts
 * @returns {{ close: () => Promise<void> }}
 */
function openAuthUrl(authUrl, { autopilot = false, providerId, label, redirectUri }) {
  if (!autopilot) {
    shell.openExternal(authUrl);
    return { close: async () => {} };
  }

  // Preferred (Windows only): drive the user's real, logged-in Chrome via
  // OS-level mouse input. This reuses the existing browser session, so there's
  // usually no login. OS-level input isn't implemented on macOS/Linux yet, so we
  // skip straight to the CDP path there instead of throwing/catching noisily.
  if (process.platform === "win32") {
    try {
      return launchAndDriveDesktop(authUrl, { providerId, label });
    } catch (err) {
      sendProgress("oauth:autopilot:progress", {
        providerId,
        label,
        status: "step",
        message: `Falling back to Chrome automation (${err?.message || err}).`,
      });
    }
  }

  // Fallback (non-Windows): drive a CDP-controlled Chrome instance.
  const controllerPromise = launchAndDrive(authUrl, { providerId, label, redirectUri }).catch((err) => {
    // Couldn't drive Chrome — be honest and fall back to the default browser so the
    // user can still finish manually rather than silently failing.
    sendProgress("oauth:autopilot:needsUser", {
      providerId,
      label,
      message: `I couldn't open Chrome to drive it (${err?.message || err}). I've opened your browser — please approve ${label} there.`,
    });
    shell.openExternal(authUrl);
    return null;
  });

  return {
    close: async () => {
      const controller = await controllerPromise;
      if (controller) await controller.close();
    },
  };
}

module.exports = { openAuthUrl };
