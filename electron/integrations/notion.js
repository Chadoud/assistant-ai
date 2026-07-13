/**
 * Notion OAuth 2 (authorization code, loopback) + Notion API health.
 *
 * Notion does NOT support PKCE for public integrations and requires the client
 * secret for the token exchange (HTTP Basic auth). It also does NOT honor RFC
 * 8252 port-agnostic loopback matching, so we use a FIXED loopback port that
 * the user must register verbatim as the redirect URI in their Notion
 * integration's OAuth settings.
 *
 * Setup (one-time, like the other providers):
 *   1. Create a public integration at https://www.notion.so/my-integrations
 *   2. Add redirect URI exactly: http://localhost:8731/callback
 *   3. Set EXOSITES_NOTION_CLIENT_ID and EXOSITES_NOTION_CLIENT_SECRET in .env
 *
 * Why `localhost` and not `127.0.0.1`: Notion's "Connections" portal rejects a raw
 * loopback IP in the redirect-URI field (its URL input auto-prepends `https://`,
 * producing `https://http://127.0.0.1/...`). Notion special-cases `http://localhost`
 * as a valid development redirect (see their OAuth SDK guide), so we register that.
 * The loopback server still binds 127.0.0.1; browsers resolve `localhost` to it.
 *
 * Notion access tokens are long-lived (no refresh token in the standard flow),
 * so there is nothing to refresh.
 */

const crypto = require("crypto");
const { startLoopbackServer } = require("./loopbackServer");
const { URL } = require("url");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");
const { openAuthUrl } = require("./oauthAutopilot");
const notionClientStore = require("./notionClientStore");

const NOTION_AUTH = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN = "https://api.notion.com/v1/oauth/token";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Fixed loopback port — must match the redirect URI registered in Notion. */
const NOTION_LOOPBACK_PORT = 8731;
const NOTION_REDIRECT_URI = `http://localhost:${NOTION_LOOPBACK_PORT}/callback`;
const NOTION_HEALTH_TIMEOUT_MS = 15_000;

/**
 * OAuth client credentials, preferring the in-app encrypted store (pasted via the
 * setup guide) and falling back to `.env` / environment variables for power users
 * and packaged config.
 *
 * @returns {{ clientId: string; clientSecret: string }}
 */
function getStoredOrEnvClient() {
  const stored = notionClientStore.loadNotionOAuthClient();
  if (stored) return stored;
  return {
    clientId: (process.env.EXOSITES_NOTION_CLIENT_ID || "").trim(),
    clientSecret: (process.env.EXOSITES_NOTION_CLIENT_SECRET || "").trim(),
  };
}

function getClientId() {
  return getStoredOrEnvClient().clientId;
}

function getClientSecret() {
  return getStoredOrEnvClient().clientSecret;
}

/**
 * Run the Notion authorization-code OAuth flow.
 * @param {{ autopilot?: boolean }} [options] When `autopilot` is true, the AI drives
 *   the consent page in an app-owned window instead of the external browser.
 * @returns {Promise<{ access_token: string; workspace_name?: string; workspace_id?: string; bot_id?: string }>}
 */
async function connectNotionPkce(options = {}) {
  const autopilot = Boolean(options.autopilot);
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId) throw new Error("EXOSITES_NOTION_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("EXOSITES_NOTION_CLIENT_SECRET is not set");

  const state = crypto.randomBytes(16).toString("hex");
  // Notion registers the redirect URI as `http://localhost:PORT/callback`, and the
  // browser may resolve `localhost` to IPv6 `::1` — so bind both loopback families
  // (a 127.0.0.1-only bind would refuse the IPv6 callback).
  const lb = await startLoopbackServer({
    port: NOTION_LOOPBACK_PORT,
    label: "[notion]",
    dualStackLoopback: true,
  });

  const authUrl = new URL(NOTION_AUTH);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", NOTION_REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  const auto = openAuthUrl(authUrl.toString(), {
    autopilot,
    providerId: "notion",
    label: "Notion",
    redirectUri: NOTION_REDIRECT_URI,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await lb.close();
      auto.close();
      reject(new Error("notion_auth_timeout"));
    }, 5 * 60 * 1000);

    lb.server.on("request", async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${lb.port}`);
        if (url.pathname !== "/callback") {
          res.end();
          return;
        }
        clearTimeout(timeout);
        await lb.close();

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error || !code || returnedState !== state) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: "Notion sign-in didn't finish",
              subline: "You can close this tab and try connecting Notion again from the app.",
            })
          );
          auto.close();
          reject(new Error(error || "notion_auth_failed"));
          return;
        }

        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenRes = await fetch(NOTION_TOKEN, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/json",
            "Notion-Version": NOTION_VERSION,
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: NOTION_REDIRECT_URI,
          }),
        });
        const data = await tokenRes.json();

        if (!tokenRes.ok || !data.access_token) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: "Notion sign-in didn't finish",
              subline: "Notion couldn't complete the connection. Close this tab and try again from the app.",
            })
          );
          auto.close();
          reject(new Error(data.error || "notion_token_exchange_failed"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          oauthLoopbackSuccessHtml({
            headline: "Notion account connected",
            subline: "You can close this tab and return to the app.",
          })
        );
        // Let the success page show briefly before closing the autopilot window.
        setTimeout(() => auto.close(), 1200);
        resolve({
          access_token: data.access_token,
          workspace_name: data.workspace_name || "",
          workspace_id: data.workspace_id || "",
          bot_id: data.bot_id || "",
        });
      } catch (err) {
        clearTimeout(timeout);
        await lb.close().catch(() => {});
        auto.close();
        reject(err);
      }
    });
  });
}

/**
 * Notion tokens do not expire and there is no refresh token — nothing to do.
 * Present for parity with the other providers' session helpers.
 * @returns {Promise<null>}
 */
async function refreshStoredTokens() {
  return null;
}

/**
 * @param {{ access_token?: string }} secrets
 * @returns {Promise<string | null>}
 */
async function getValidAccessToken(secrets) {
  return secrets?.access_token || null;
}

/** @returns {boolean} */
function notionSessionLooksUsable(secrets) {
  return Boolean(secrets && typeof secrets.access_token === "string" && secrets.access_token);
}

/**
 * Ping the Notion API to confirm the token still works.
 * @param {string} token
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function notionUserHealth(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTION_HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${NOTION_API}/users/me`, {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  getClientId,
  getClientSecret,
  connectNotionPkce,
  refreshStoredTokens,
  getValidAccessToken,
  notionSessionLooksUsable,
  notionUserHealth,
  NOTION_REDIRECT_URI,
};
