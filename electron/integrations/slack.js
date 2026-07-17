/**
 * Slack OAuth 2 (loopback) + Slack Web API helpers.
 * Register at https://api.slack.com/apps
 * User token scopes (assistant + optional file import): see SLACK_USER_SCOPES.
 * Credentials: paste in-app (setup guide) or set EXOSITES_SLACK_CLIENT_ID / EXOSITES_SLACK_CLIENT_SECRET.
 * Redirect URLs: add http://127.0.0.1 (Slack accepts loopback on any port for desktop OAuth).
 */

const crypto = require("crypto");
const slackClientStore = require("./slackClientStore");
const fs = require("fs").promises;
const path = require("path");
const { b64url } = require("./pkce");
const { startLoopbackServer } = require("./loopbackServer");
const { URL } = require("url");
const { shell, app } = require("electron");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");

const SLACK_AUTH = "https://slack.com/oauth/v2/authorize";
const SLACK_TOKEN = "https://slack.com/api/oauth.v2.access";
const SLACK_API = "https://slack.com/api";

const SLACK_PAGE_SIZE = 100;
const SLACK_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const SLACK_METADATA_TIMEOUT_MS = 15_000;
const SLACK_DOWNLOAD_TIMEOUT_MS = 90_000;

/** User token scopes — messaging, search, and file metadata for the assistant. */
const SLACK_USER_SCOPES = [
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "chat:write",
  "search:read",
  "users:read",
  "files:read",
].join(",");

function getStoredOrEnvClient() {
  const stored = slackClientStore.loadSlackOAuthClient();
  if (stored) return stored;
  return {
    clientId: (process.env.EXOSITES_SLACK_CLIENT_ID || "").trim(),
    clientSecret: (process.env.EXOSITES_SLACK_CLIENT_SECRET || "").trim(),
  };
}

function getClientId() {
  return getStoredOrEnvClient().clientId;
}

function getClientSecret() {
  return getStoredOrEnvClient().clientSecret;
}


async function withTimeout(label, timeoutMs, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`${label}_timeout`);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run Slack OAuth2 flow (Slack uses confidential client — needs client_secret).
 * @returns {Promise<{ access_token: string; team_id: string; team_name: string }>}
 */
async function connectSlackOAuth() {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) throw new Error("EXOSITES_SLACK_CLIENT_ID or EXOSITES_SLACK_CLIENT_SECRET is not set");

  const state = b64url(crypto.randomBytes(16));
  const lb = await startLoopbackServer({ label: "[slack]" });
  const redirectUri = `http://127.0.0.1:${lb.port}/callback`;

  const authUrl = new URL(SLACK_AUTH);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("user_scope", SLACK_USER_SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  shell.openExternal(authUrl.toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await lb.close();
      reject(new Error("slack_auth_timeout"));
    }, 5 * 60 * 1000);

    lb.server.on("request", async (req, res) => {
      try {
        const url = new URL(req.url, `http://127.0.0.1:${lb.port}`);
        if (url.pathname !== "/callback") { res.end(); return; }
        clearTimeout(timeout);
        await lb.close();

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error || !code || returnedState !== state) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: "Slack sign-in didn't finish",
              subline: "You can close this tab and try connecting Slack again from the app.",
            })
          );
          reject(new Error(error || "slack_auth_failed"));
          return;
        }

        const tokenRes = await fetch(SLACK_TOKEN, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }).toString(),
        });
        const data = await tokenRes.json();

        const accessToken = data.authed_user?.access_token || data.access_token;
        if (!data.ok || !accessToken) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            oauthLoopbackErrorHtml({
              headline: "Slack sign-in didn't finish",
              subline: "Slack couldn't complete the connection. Close this tab and try again from the app.",
            })
          );
          reject(new Error(data.error || "slack_token_exchange_failed"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          oauthLoopbackSuccessHtml({
            headline: "Slack account connected",
            subline: "You can close this tab and return to the app.",
          })
        );
        resolve({
          access_token: accessToken,
          team_id: data.team?.id || "",
          team_name: data.team?.name || "Slack Workspace",
          token_type: data.authed_user?.access_token ? "user" : "bot",
        });
      } catch (err) {
        clearTimeout(timeout);
        await lb.close().catch(() => {});
        reject(err);
      }
    });
  });
}

/** Slack tokens don't expire (user tokens); no refresh needed. */
async function refreshStoredTokens(_secrets) {
  return null;
}

async function getValidAccessToken(secrets) {
  return secrets?.access_token || null;
}

function slackSessionLooksUsable(secrets) {
  return !!secrets?.access_token;
}

/**
 * @param {string} token
 */
async function slackWorkspaceHealth(token) {
  try {
    const res = await withTimeout("slack_health", SLACK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${SLACK_API}/auth.test`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (!data.ok) return { ok: false, reason: data.error || "auth_test_failed" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * List one page of files in the workspace.
 * @param {string} token
 * @param {{ channel?: string; types?: string; tsFrom?: string; cursor?: string }} opts
 */
async function listSlackFiles(token, { channel, types = "all", tsFrom, cursor } = {}) {
  try {
    const params = new URLSearchParams({ count: String(SLACK_PAGE_SIZE) });
    if (types) params.set("types", types);
    if (channel) params.set("channel", channel);
    if (tsFrom) params.set("ts_from", tsFrom);
    if (cursor) params.set("cursor", cursor);

    const res = await withTimeout("slack_list", SLACK_METADATA_TIMEOUT_MS, (signal) =>
      fetch(`${SLACK_API}/files.list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (!data.ok) return { ok: false, reason: data.error || "files_list_failed" };
    return {
      ok: true,
      files: data.files || [],
      nextCursor: data.response_metadata?.next_cursor || null,
    };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * Download Slack files (by url_private) to a staging directory.
 * @param {string} token
 * @param {object[]} files  Slack file objects with at least { id, name, url_private, size }
 * @param {string} stagingDir
 */
async function importSlackFilesToDirectory(token, files, stagingDir) {
  await fs.mkdir(stagingDir, { recursive: true });
  const localPaths = [];
  const failed = [];

  for (const file of files) {
    const downloadUrl = file.url_private_download || file.url_private;
    if (!downloadUrl || !file.name) {
      failed.push({ id: file?.id || "unknown", reason: "no_download_url" });
      continue;
    }
    const size = Number(file.size || 0);
    if (size > SLACK_IMPORT_MAX_BYTES) {
      failed.push({ id: file.id, reason: "too_large" });
      continue;
    }
    const destPath = path.join(stagingDir, sanitizeFilename(file.name));
    try {
      const res = await withTimeout("slack_download", SLACK_DOWNLOAD_TIMEOUT_MS, (signal) =>
        fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        })
      );
      if (!res.ok) {
        failed.push({ id: file.id, reason: `http_${res.status}` });
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(destPath, buf);
      localPaths.push(destPath);
    } catch (e) {
      failed.push({ id: file.id, reason: e.message || "download_failed" });
    }
  }

  return { ok: true, localPaths, failed, stagingDir };
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
}

function slackStagingDir(jobId) {
  return path.join(require("../accountProfile").resolveProfileRoot(), "slack_sort_staging", jobId);
}

module.exports = {
  SLACK_USER_SCOPES,
  getClientId,
  getClientSecret,
  connectSlackOAuth,
  refreshStoredTokens,
  getValidAccessToken,
  slackSessionLooksUsable,
  slackWorkspaceHealth,
  listSlackFiles,
  importSlackFilesToDirectory,
  slackStagingDir,
};
