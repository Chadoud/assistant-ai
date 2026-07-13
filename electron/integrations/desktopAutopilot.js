/**
 * OS-level connect autopilot: drive the user's REAL, already-logged-in Chrome by
 * moving the actual mouse — the way a human does.
 *
 * Flow: open the auth URL in the installed Chrome (default profile, so the user's
 * existing login is used), then loop: ask the backend to screenshot the desktop and
 * locate the next control, and click it with the OS mouse. We pause (do nothing) on
 * sign-in / 2FA / captcha so the user types credentials, then resume automatically.
 * The loopback server (in the provider connector) completes the connection; setting
 * the returned controller's `aborted` flag stops the loop.
 */

const { spawn } = require("child_process");
const { shell } = require("electron");

const { BACKEND_PORT } = require("../constants");
const state = require("../state");
const { sendProgress } = require("./autopilotCore");
const { findChromeExecutable } = require("./chromeAutopilot");
const desktopInput = require("./desktopInput");

const MAX_ITERATIONS = 60;
const OVERALL_DEADLINE_MS = 4 * 60 * 1000;
const POLL_DELAY_MS = 1200;
const GATE_DELAY_MS = 2500;
const DECISION_TIMEOUT_MS = 25000;
// A failed decision (network blip, rate limit) must NOT kill the whole run — Chrome
// is mid-consent. Tolerate several in a row before giving up.
const MAX_CONSECUTIVE_ERRORS = 6;
const ERROR_BACKOFF_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open the auth URL in the installed Chrome (real profile), or the default browser. */
function openInChrome(authUrl) {
  const chromePath = findChromeExecutable();
  if (chromePath) {
    try {
      const child = spawn(chromePath, [authUrl], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    } catch {
      /* fall through to default browser */
    }
  }
  shell.openExternal(authUrl);
}

async function requestDesktopAction({ providerId, label, history }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DECISION_TIMEOUT_MS);
  const headers = { "Content-Type": "application/json" };
  if (state.appToken) headers["X-App-Token"] = state.appToken;
  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/v1/desktop-nav/next-action`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        provider: providerId,
        label,
        goal: `Finish authorizing and connecting ${label} in the Chrome window on screen.`,
        history,
      }),
    });
    if (!res.ok) return { ok: false, error: `desktop-nav http_${res.status}` };
    return await res.json();
  } catch (e) {
    return { ok: false, error: e?.message || "desktop-nav request failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function drive(controller, { providerId, label }) {
  const history = [];
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  let consecutiveErrors = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (controller.aborted || Date.now() > deadline) return;
    await sleep(POLL_DELAY_MS);
    if (controller.aborted) return;

    const decision = await requestDesktopAction({ providerId, label, history });
    if (controller.aborted) return;
    if (!decision.ok) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        sendProgress("oauth:autopilot:progress", { providerId, label, status: "error", message: decision.error });
        return;
      }
      sendProgress("oauth:autopilot:progress", {
        providerId,
        label,
        status: "step",
        message: `Retrying — ${decision.error}`,
      });
      await sleep(ERROR_BACKOFF_MS);
      continue;
    }
    consecutiveErrors = 0;

    const action = decision.data;
    history.push(action.reason || action.type);
    sendProgress("oauth:autopilot:progress", { providerId, label, status: "step", message: action.reason });

    if (action.type === "done") return;
    if (action.type === "wait") {
      // The backend signals a rate-limit pause via retry_after — honor it so we don't
      // hammer the quota; otherwise the standard poll delay already elapsed above.
      if (typeof decision.retry_after === "number" && decision.retry_after > 0) {
        await sleep(Math.min(decision.retry_after * 1000, OVERALL_DEADLINE_MS));
      }
      continue;
    }
    if (action.type === "need_user") {
      sendProgress("oauth:autopilot:needsUser", { providerId, label, message: action.reason });
      await sleep(GATE_DELAY_MS); // give the user time; re-evaluate on the next loop.
      continue;
    }

    if (action.type === "click" && typeof action.x === "number" && typeof action.y === "number") {
      const px = action.x * decision.screen.width;
      const py = action.y * decision.screen.height;
      try {
        await desktopInput.clickAt(px, py);
      } catch (e) {
        sendProgress("oauth:autopilot:progress", { providerId, label, status: "error", message: e?.message });
        return;
      }
    }
  }
}

/**
 * Launch the real Chrome and drive it with OS-level mouse input.
 *
 * @param {string} authUrl
 * @param {{ providerId: string; label: string }} ctx
 * @returns {{ close: () => Promise<void> }} `close()` aborts the drive loop (it does
 *   NOT close the user's Chrome — that's their window).
 */
function launchAndDriveDesktop(authUrl, { providerId, label }) {
  if (!desktopInput.isSupported()) {
    throw new Error("OS-level input is only supported on Windows");
  }
  const controller = { aborted: false };
  sendProgress("oauth:autopilot:progress", { providerId, label, status: "opening", message: `Opening ${label} in Chrome` });
  openInChrome(authUrl);
  drive(controller, { providerId, label }).catch(() => {});
  return {
    close: async () => {
      controller.aborted = true;
    },
  };
}

module.exports = { launchAndDriveDesktop };
