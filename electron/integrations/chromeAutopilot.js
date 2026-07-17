/**
 * Drive the user's installed Google Chrome to complete an OAuth consent flow.
 *
 * Unlike the in-app Electron window, this launches the real `chrome.exe` via
 * puppeteer-core and the Chrome DevTools Protocol. It uses a dedicated, persistent
 * profile (so the OAuth login is remembered after the first sign-in) — it cannot
 * attach to the user's everyday Chrome profile, which is locked by the running
 * instance. The same backend brain decides each action; we only pause for
 * human-only gates (sign-in / 2FA / captcha) and resume automatically afterward.
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const {
  MAX_STEPS,
  MAX_ITERATIONS,
  POST_ACTION_DELAY_MS,
  USER_GATE_TIMEOUT_MS,
  SNAPSHOT_JS,
  buildActionJs,
  sendProgress,
  requestNextAction,
} = require("./autopilotCore");

/** Common install locations for Chrome, checked when channel detection fails. */
function candidateChromePaths() {
  if (process.platform === "win32") {
    const dirs = [
      process.env["PROGRAMFILES"],
      process.env["PROGRAMFILES(X86)"],
      process.env["LOCALAPPDATA"],
    ].filter(Boolean);
    return dirs.map((d) => path.join(d, "Google/Chrome/Application/chrome.exe"));
  }
  if (process.platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser"];
}

function findChromeExecutable() {
  for (const candidate of candidateChromePaths()) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launch system Chrome and drive the consent page. Resolves with a controller once
 * the browser is up; the loopback server (in the provider connector) completes the
 * connection. Rejects if Chrome can't be launched so the caller can fall back.
 *
 * @param {string} authUrl
 * @param {{ providerId: string; label: string; redirectUri: string }} ctx
 * @returns {Promise<{ close: () => Promise<void> }>}
 */
async function launchAndDrive(authUrl, { providerId, label, redirectUri }) {
  let puppeteer;
  try {
    puppeteer = require("puppeteer-core");
  } catch (e) {
    throw new Error(`puppeteer-core not available: ${e?.message || e}`);
  }

  const executablePath = findChromeExecutable();
  const userDataDir = oauthChromeProfileDir();

  const launchOptions = {
    headless: false,
    defaultViewport: null,
    userDataDir,
    args: ["--no-first-run", "--no-default-browser-check", `--app=${authUrl}`],
  };
  if (executablePath) launchOptions.executablePath = executablePath;
  else launchOptions.channel = "chrome"; // let puppeteer locate an installed Chrome

  const browser = await puppeteer.launch(launchOptions);

  // Drive in the background; the loopback server owns completion.
  drive(browser, authUrl, { providerId, label, redirectUri }).catch(() => {});

  return {
    close: async () => {
      try {
        await browser.close();
      } catch {
        /* already gone */
      }
    },
  };
}

async function getActivePage(browser, authUrl) {
  const pages = await browser.pages();
  const page = pages.find((p) => p.url() && p.url() !== "about:blank") || pages[0];
  if (page && (!page.url() || page.url() === "about:blank")) {
    await page.goto(authUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  return page;
}

async function drive(browser, authUrl, { providerId, label, redirectUri }) {
  const callbackOrigin = (() => {
    try {
      const u = new URL(redirectUri);
      return `${u.protocol}//${u.host}`;
    } catch {
      return redirectUri;
    }
  })();

  const page = await getActivePage(browser, authUrl);
  if (!page) return;

  sendProgress("oauth:autopilot:progress", {
    providerId,
    label,
    status: "opening",
    message: `Opening ${label} in Chrome`,
  });

  const history = [];
  let automatedSteps = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS && automatedSteps < MAX_STEPS; iteration += 1) {
    if (page.isClosed()) return;
    if ((page.url() || "").startsWith(callbackOrigin)) return; // loopback finishes it.

    await page.waitForNetworkIdle({ idleTime: 400, timeout: 8000 }).catch(() => {});
    if (page.isClosed() || (page.url() || "").startsWith(callbackOrigin)) return;

    let snapshot;
    try {
      snapshot = await page.evaluate(SNAPSHOT_JS);
    } catch {
      return; // navigated away (likely to the callback); let the loopback finish.
    }

    let screenshotB64 = null;
    try {
      screenshotB64 = await page.screenshot({ encoding: "base64", type: "jpeg", quality: 60 });
    } catch {
      /* screenshot is optional */
    }

    const decision = await requestNextAction({ providerId, label, snapshot, screenshotB64, history });
    if (!decision.ok) {
      sendProgress("oauth:autopilot:progress", { providerId, label, status: "error", message: decision.error });
      await bringToFront(page);
      return;
    }

    const action = decision.data;
    history.push(action.reason || action.type);
    sendProgress("oauth:autopilot:progress", { providerId, label, status: "step", message: action.reason });

    if (action.type === "done") return;
    if (action.type === "wait") {
      await sleep(POST_ACTION_DELAY_MS * 2);
      continue;
    }
    if (action.type === "need_user") {
      await bringToFront(page);
      sendProgress("oauth:autopilot:needsUser", { providerId, label, message: action.reason });
      const advanced = await waitForUserToAdvance(page, snapshot.url, callbackOrigin);
      if (!advanced || page.isClosed()) return;
      continue;
    }

    if (action.ref == null) continue;
    try {
      await page.evaluate(buildActionJs(action));
    } catch {
      return;
    }
    automatedSteps += 1;
    await sleep(POST_ACTION_DELAY_MS);
  }

  if (!page.isClosed() && !(page.url() || "").startsWith(callbackOrigin)) {
    await bringToFront(page);
    sendProgress("oauth:autopilot:needsUser", {
      providerId,
      label,
      message: "I couldn't finish automatically — please complete the last step in Chrome.",
    });
  }
}

async function bringToFront(page) {
  try {
    await page.bringToFront();
  } catch {
    /* ignore */
  }
}

/** Resolve true once the page leaves a human-only gate (URL change) or reaches the callback. */
function waitForUserToAdvance(page, fromUrl, callbackOrigin) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (advanced) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      page.off("framenavigated", onNav);
      resolve(advanced);
    };
    const onNav = () => {
      const url = page.url() || "";
      if (url.startsWith(callbackOrigin) || (url && url !== fromUrl)) finish(true);
    };
    const timer = setTimeout(() => finish(false), USER_GATE_TIMEOUT_MS);
    page.on("framenavigated", onNav);
    page.once("close", () => finish(false));
  });
}

/** DEVICE-scoped transient Chrome profile for OAuth autopilot (not per-account vault). */
function oauthChromeProfileDir(deviceRoot) {
  let root = deviceRoot;
  if (!root) {
    try {
      root = app.getPath("userData");
    } catch {
      root = "";
    }
  }
  return root ? path.join(root, "oauth-chrome-profile") : "";
}

/**
 * Clear shared OAuth Chrome profile so cookies/session do not leak across accounts.
 * @param {string} [deviceRoot]
 */
function clearOauthChromeProfile(deviceRoot) {
  const dir = oauthChromeProfileDir(deviceRoot);
  if (!dir || !fs.existsSync(dir)) return { ok: true, cleared: false };
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, cleared: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  launchAndDrive,
  findChromeExecutable,
  oauthChromeProfileDir,
  clearOauthChromeProfile,
};
