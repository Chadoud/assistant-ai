/**
 * Meta WhatsApp Embedded Signup in an app-owned BrowserWindow.
 *
 * Loads Meta's onboard URL directly — the Facebook JS SDK often never
 * initializes inside Electron (stuck on "Loading Meta…"). The preload script
 * listens for WA_EMBEDDED_SIGNUP postMessage events from Meta pages.
 */

const { BrowserWindow, ipcMain, session } = require("electron");
const { tryExtractMetaOAuthCode } = require("./whatsappEmbeddedSignupOAuth");

const SIGNUP_TIMEOUT_MS = 5 * 60 * 1000;
/** Meta may emit CANCEL or close the window briefly before the OAuth redirect lands. */
const SIGNUP_FAILURE_DEBOUNCE_MS = 900;
/** After FINISH without code, wait longer for hosted_es / api redirect before failing. */
const SIGNUP_OAUTH_REDIRECT_WAIT_MS = 3500;
const META_CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let signupWindow = null;

function getSignupPreloadPath() {
  return require("path").join(__dirname, "..", "preload-whatsapp-signup.js");
}

/**
 * LaunchBridge URL for WhatsApp Embedded Signup (no FB JS SDK required).
 * @param {string} metaAppId
 * @param {string} configId
 * @param {string} [redirectUri] HTTPS callback registered in Meta app settings
 */
function buildOnboardUrl(metaAppId, configId, redirectUri) {
  const extras = JSON.stringify({ setup: {}, sessionInfoVersion: "3" });
  const params = new URLSearchParams({
    app_id: metaAppId,
    config_id: configId,
    response_type: "code",
    scope: "whatsapp_business_messaging,whatsapp_business_management",
    extras,
  });
  const redirect = typeof redirectUri === "string" ? redirectUri.trim() : "";
  if (redirect) {
    params.set("redirect_uri", redirect);
  }
  return `https://business.facebook.com/messaging/whatsapp/onboard/?${params.toString()}`;
}

function mapSignupFailureReason(status) {
  switch (status) {
    case "not_authorized":
    case "unknown":
      return "meta_signup_cancelled";
    case "sdk_error":
      return "embedded_signup_not_configured";
    case "oauth_error":
      return "meta_signup_oauth_error";
    default:
      return "meta_signup_failed";
  }
}

/**
 * @param {string} metaAppId
 * @param {string} configId
 * @param {string} redirectUri
 */
async function runWhatsAppEmbeddedSignup(metaAppId, configId, redirectUri) {
  if (!metaAppId || !configId) {
    return { ok: false, reason: "embedded_signup_not_configured" };
  }
  if (!redirectUri || typeof redirectUri !== "string" || !redirectUri.trim()) {
    return { ok: false, reason: "embedded_signup_not_configured" };
  }

  if (signupWindow && !signupWindow.isDestroyed()) {
    signupWindow.focus();
    return { ok: false, reason: "embedded_signup_already_open" };
  }

  const onboardUrl = buildOnboardUrl(metaAppId, configId, redirectUri);
  console.log("[whatsappEmbeddedSignup] opening Meta onboard URL");

  return new Promise((resolve) => {
    let promiseSettled = false;
    let latestSession = {};
    let failureTimer = null;
    let closingAfterSuccess = false;
    let awaitingOAuthRedirect = false;

    const clearFailureTimer = () => {
      if (failureTimer) {
        clearTimeout(failureTimer);
        failureTimer = null;
      }
    };

    const resolveOnce = (result) => {
      if (promiseSettled) return;
      promiseSettled = true;
      clearFailureTimer();
      clearTimeout(timer);
      ipcMain.removeListener("whatsapp-embedded-signup:complete", onComplete);
      resolve(result);
    };

    const resolveSuccess = (payload) => {
      closingAfterSuccess = true;
      resolveOnce({ ok: true, ...payload });
      destroySignupWindow();
    };

    /** Delay failure so a redirect `code=` or FINISH event can win the race. */
    const scheduleFailure = (result, debounceMs = SIGNUP_FAILURE_DEBOUNCE_MS) => {
      if (promiseSettled) return;
      clearFailureTimer();
      failureTimer = setTimeout(() => {
        if (!promiseSettled) resolveOnce(result);
      }, debounceMs);
    };

    const destroySignupWindow = () => {
      if (signupWindow && !signupWindow.isDestroyed()) {
        signupWindow.destroy();
      }
      signupWindow = null;
    };

    const onComplete = (event, payload) => {
      if (!signupWindow || event.sender !== signupWindow.webContents) return;
      if (payload?.session && typeof payload.session === "object") {
        latestSession = payload.session;
      }
      const code = typeof payload?.code === "string" ? payload.code.trim() : "";
      const sess =
        payload?.session && typeof payload.session === "object" ? payload.session : latestSession;
      if (code) {
        const codeSource =
          payload?.codeSource === "oauth_callback" ||
          payload?.codeSource === "meta_hosted_es" ||
          payload?.codeSource === "embedded_finish"
            ? payload.codeSource
            : undefined;
        resolveSuccess({
          code,
          codeSource,
          oauthRedirectUri:
            typeof payload?.oauthRedirectUri === "string" ? payload.oauthRedirectUri.trim() : undefined,
          phoneNumberId:
            typeof sess.phone_number_id === "string" ? sess.phone_number_id.trim() : undefined,
          businessAccountId: typeof sess.waba_id === "string" ? sess.waba_id.trim() : undefined,
          displayPhoneNumber:
            typeof sess.display_phone_number === "string"
              ? sess.display_phone_number.trim()
              : undefined,
        });
        return;
      }

      const status = typeof payload?.status === "string" ? payload.status : "no_code";
      // FINISH often arrives before the OAuth redirect URL — wait for handleNavigationUrl.
      if (status === "connected") {
        awaitingOAuthRedirect = true;
        clearFailureTimer();
        return;
      }

      console.warn("[whatsappEmbeddedSignup] Meta login failed:", status, payload?.oauthError || "");
      scheduleFailure({
        ok: false,
        reason: mapSignupFailureReason(status),
      });
    };

    ipcMain.on("whatsapp-embedded-signup:complete", onComplete);

    const timer = setTimeout(() => {
      console.warn("[whatsappEmbeddedSignup] timed out waiting for Meta");
      resolveOnce({ ok: false, reason: "meta_signup_timeout" });
    }, SIGNUP_TIMEOUT_MS);

    const signupSession = session.fromPartition("persist:whatsapp-meta-signup");

    signupWindow = new BrowserWindow({
      width: 560,
      height: 820,
      show: true,
      autoHideMenuBar: true,
      title: "Connect WhatsApp Business",
      webPreferences: {
        session: signupSession,
        preload: getSignupPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    signupWindow.webContents.setUserAgent(META_CHROME_USER_AGENT);

    const handleNavigationUrl = (url) => {
      const oauthError = (() => {
        try {
          const parsed = new URL(url);
          if (!parsed.hostname.includes("facebook.com")) return null;
          return parsed.searchParams.get("error");
        } catch {
          return null;
        }
      })();

      if (oauthError) {
        const description = (() => {
          try {
            return new URL(url).searchParams.get("error_description") || oauthError;
          } catch {
            return oauthError;
          }
        })();
        console.warn("[whatsappEmbeddedSignup] Meta OAuth redirect error:", oauthError, description);
        scheduleFailure({
          ok: false,
          reason: "meta_signup_oauth_error",
        });
        return;
      }

      const extracted = tryExtractMetaOAuthCode(url, redirectUri);
      if (extracted) {
        awaitingOAuthRedirect = false;
        console.log(
          "[whatsappEmbeddedSignup] captured OAuth code from Meta redirect",
          extracted.codeSource,
        );
        resolveSuccess({
          code: extracted.code,
          codeSource: extracted.codeSource,
          oauthRedirectUri: extracted.oauthRedirectUri,
          phoneNumberId:
            typeof latestSession.phone_number_id === "string"
              ? latestSession.phone_number_id.trim()
              : undefined,
          businessAccountId:
            typeof latestSession.waba_id === "string" ? latestSession.waba_id.trim() : undefined,
          displayPhoneNumber:
            typeof latestSession.display_phone_number === "string"
              ? latestSession.display_phone_number.trim()
              : undefined,
        });
      }
    };

    signupWindow.webContents.on("did-navigate", (_event, url) => handleNavigationUrl(url));
    signupWindow.webContents.on("did-navigate-in-page", (_event, url) => handleNavigationUrl(url));
    signupWindow.webContents.on("will-redirect", (_event, url) => handleNavigationUrl(url));

    signupWindow.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, url) => {
      // -3 = ERR_ABORTED when Meta redirects away; URL still carries ?code=
      if (url) handleNavigationUrl(url);
      if (errorCode !== -3) {
        console.error("[whatsappEmbeddedSignup] page load failed:", errorCode, _errorDescription, url);
      }
    });

    signupWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.includes("facebook.com")) {
        signupWindow?.loadURL(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });

    signupWindow.once("closed", () => {
      signupWindow = null;
      if (closingAfterSuccess || promiseSettled) return;
      const debounceMs = awaitingOAuthRedirect ? SIGNUP_OAUTH_REDIRECT_WAIT_MS : SIGNUP_FAILURE_DEBOUNCE_MS;
      scheduleFailure({ ok: false, reason: "meta_signup_window_closed" }, debounceMs);
    });

    signupWindow.loadURL(onboardUrl).catch((err) => {
      const msg = err?.message || String(err);
      // Meta redirects onboard → facebook.com/dialog/oauth; Electron reports that as ERR_ABORTED.
      if (msg.includes("ERR_ABORTED") || msg.includes("(-3)")) return;
      console.error("[whatsappEmbeddedSignup] loadURL failed:", msg);
      resolveOnce({ ok: false, reason: "meta_signup_load_failed" });
      destroySignupWindow();
    });
  });
}

module.exports = {
  runWhatsAppEmbeddedSignup,
};
