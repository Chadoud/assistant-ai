/**
 * Screen capture IPC handler.
 *
 * ipcMain.handle('capture:screen')
 *   → uses Electron desktopCapturer to grab the primary screen thumbnail
 *   → returns a base64-encoded JPEG string (quality 75, 1280×960 max)
 *
 * The returned string is sent directly to POST /vision/screen for analysis.
 *
 * Two gates protect this sensitive capability:
 *   1. Sender validation — only first-party app frames may call it.
 *   2. Consent window — the renderer must record an explicit user gesture via
 *      `capture:grantConsent` (the user clicking the screen-share button)
 *      shortly before capture. A cold call with no recent consent is refused.
 */

const { ipcMain } = require("electron");
const state = require("../state");
const { isTrustedSender } = require("./senderGuard");
const { capturePrimaryScreenJpeg } = require("../screenCaptureCore");

/** How long a single user click authorizes capture for (ms). Generous enough to
 * cover the desktopCapturer round-trip, short enough that consent can't go stale. */
const CONSENT_WINDOW_MS = 60_000;

function registerScreenCaptureHandlers() {
  ipcMain.handle("capture:grantConsent", (event) => {
    if (!isTrustedSender(event)) {
      return { ok: false, error: "untrusted_sender" };
    }
    state.screenCaptureConsentUntil = Date.now() + CONSENT_WINDOW_MS;
    return { ok: true };
  });

  ipcMain.handle("capture:screen", async (event) => {
    if (!isTrustedSender(event)) {
      return { ok: false, error: "untrusted_sender" };
    }
    const consentUntil = state.screenCaptureConsentUntil || 0;
    if (Date.now() > consentUntil) {
      return { ok: false, error: "consent_required" };
    }
    // Single-use: each capture needs a fresh user gesture.
    state.screenCaptureConsentUntil = 0;

    const capture = await capturePrimaryScreenJpeg();
    if (!capture.ok) return capture;
    return { ok: true, data: capture.jpeg.toString("base64") };
  });
}

module.exports = { registerScreenCaptureHandlers };
