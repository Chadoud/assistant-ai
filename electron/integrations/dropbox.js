/**
 * Dropbox OAuth 2 (PKCE, loopback) + Files API helpers (list + download).
 * Set EXOSITES_DROPBOX_APP_KEY to a Dropbox app key (created at https://www.dropbox.com/developers/apps).
 * Use "Full Dropbox" or "App Folder" permission type; add http://127.0.0.1 as a redirect URI.
 */

const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { generatePkcePair, b64url } = require("./pkce");
const { startLoopbackServer } = require("./loopbackServer");
const { URL } = require("url");
const { shell, app } = require("electron");
const { oauthLoopbackSuccessHtml, oauthLoopbackErrorHtml } = require("../oauthCallbackHtml");

const DROPBOX_AUTH = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN = "https://api.dropboxapi.com/oauth2/token";
const DROPBOX_LIST_FOLDER = "https://api.dropboxapi.com/2/files/list_folder";
const DROPBOX_LIST_FOLDER_CONTINUE = "https://api.dropboxapi.com/2/files/list_folder/continue";
const DROPBOX_DOWNLOAD = "https://content.dropboxapi.com/2/files/download";
const DROPBOX_GET_CURRENT_ACCOUNT = "https://api.dropboxapi.com/2/users/get_current_account";

const DROPBOX_IMPORT_MAX_BYTES_PER_FILE = 50 * 1024 * 1024;
const DROPBOX_METADATA_TIMEOUT_MS = 15_000;
const DROPBOX_DOWNLOAD_TIMEOUT_MS = 90_000;

function getAppKey() {
  return (process.env.EXOSITES_DROPBOX_APP_KEY || "").trim();
}


/**
 * @template T
 * @param {string} label
 * @param {number} timeoutMs
 * @param {(signal: AbortSignal) => Promise<T>} task
 */
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
 * PKCE loopback OAuth for Dropbox.
 * @returns {Promise<{ ok: true; tokens: object } | { ok: false; reason: string }>}
 */
async function connectDropboxPkce() {
  const appKey = getAppKey();
  if (!appKey) return { ok: false, reason: "oauth_not_configured" };

  const { verifier, challenge } = generatePkcePair();
  const state = b64url(crypto.randomBytes(16));
  const ctx = await startLoopbackServer({ label: "[dropbox]" });
  const redirectUri = `http://127.0.0.1:${ctx.port}/callback`;

  return new Promise((resolve) => {
    let settled = false;

    ctx.server.on("request", async (req, res) => {
      try {
        const host = req.headers.host || "127.0.0.1";
        const u = new URL(req.url || "/", `http://${host}`);
        if (u.pathname !== "/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        const code = u.searchParams.get("code");
        const err = u.searchParams.get("error");
        const st = u.searchParams.get("state");

        if (settled) return;

        const failPage = async (reason, headline, subline) => {
          settled = true;
          try {
            if (!res.headersSent) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(oauthLoopbackErrorHtml({ headline, subline }));
            }
          } catch (_) {}
          await ctx.close();
          resolve({ ok: false, reason });
        };

        if (err) {
          const sub =
            err === "access_denied"
              ? "Access was cancelled. Use Connect Dropbox in the app to try again."
              : "You can close this tab and try again from the app.";
          await failPage(err, "Dropbox sign-in didn't finish", sub);
          return;
        }
        if (!code || !st) {
          await failPage(
            "missing_code_or_state",
            "Dropbox sign-in didn't finish",
            "Something was missing from Dropbox's response. Try Connect Dropbox again.",
          );
          return;
        }
        if (st !== state) {
          await failPage(
            "state_mismatch",
            "Dropbox sign-in didn't finish",
            "Security check failed. Try Connect Dropbox again.",
          );
          return;
        }

        settled = true;
        try {
          const body = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: appKey,
            code_verifier: verifier,
          });
          const tokenRes = await fetch(DROPBOX_TOKEN, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
          });
          const tokenText = await tokenRes.text();
          let tokenJson;
          try { tokenJson = JSON.parse(tokenText); } catch { tokenJson = {}; }
          if (!tokenRes.ok) {
            const msg =
              (typeof tokenJson.error_description === "string" && tokenJson.error_description) ||
              (typeof tokenJson.error === "string" && tokenJson.error) ||
              `token_http_${tokenRes.status}`;
            console.error("[dropbox-oauth] token exchange failed:", {
              status: tokenRes.status,
              error: tokenJson.error,
              error_description: tokenJson.error_description,
            });
            try {
              if (!res.headersSent) {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(oauthLoopbackErrorHtml({
                  headline: "Couldn't finish connecting",
                  subline: `Dropbox did not issue tokens (${tokenJson.error || tokenRes.status}). Check your app key and redirect URI settings, then try again.`,
                }));
              }
            } catch (_) {}
            await ctx.close();
            resolve({ ok: false, reason: msg });
            return;
          }
          // Dropbox short-lived tokens: expires_in is in seconds from now.
          const expiresAt =
            typeof tokenJson.expires_in === "number"
              ? Date.now() + tokenJson.expires_in * 1000
              : Date.now() + 3600 * 1000;
          try {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(oauthLoopbackSuccessHtml({
              headline: "Dropbox connected",
              subline: "You can close this tab and return to the app.",
            }));
          } catch (_) {}
          await ctx.close();
          resolve({
            ok: true,
            tokens: {
              access_token: tokenJson.access_token,
              refresh_token: tokenJson.refresh_token,
              expires_at: expiresAt,
            },
          });
        } catch (e) {
          try {
            if (!res.headersSent) {
              res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
              res.end(oauthLoopbackErrorHtml({
                headline: "Couldn't finish connecting",
                subline: e instanceof Error ? e.message : String(e),
              }));
            }
          } catch (_) {}
          await ctx.close();
          resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          await ctx.close();
          resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
        }
      }
    });

    const params = new URLSearchParams({
      client_id: appKey,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      token_access_type: "offline",
    });
    void shell.openExternal(`${DROPBOX_AUTH}?${params.toString()}`);

    setTimeout(async () => {
      if (!settled) {
        settled = true;
        await ctx.close();
        resolve({ ok: false, reason: "timeout" });
      }
    }, 120_000);
  });
}

/**
 * Refresh a Dropbox access token using the stored refresh_token.
 * Returns new secrets or null if refresh is not needed / not possible.
 * @param {{ access_token?: string; refresh_token?: string; expires_at?: number }} secrets
 */
async function refreshDropboxTokens(secrets) {
  if (!secrets?.refresh_token) return null;
  const appKey = getAppKey();
  if (!appKey) return null;
  // Refresh 5 minutes before expiry.
  const expiresAt = typeof secrets.expires_at === "number" ? secrets.expires_at : 0;
  if (expiresAt > Date.now() + 5 * 60 * 1000) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: secrets.refresh_token,
      client_id: appKey,
    });
    const res = await fetch(DROPBOX_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.access_token) return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token || secrets.refresh_token,
      expires_at:
        typeof json.expires_in === "number"
          ? Date.now() + json.expires_in * 1000
          : Date.now() + 3600 * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Returns a valid access token or null.
 * @param {{ access_token?: string; expires_at?: number }} secrets
 */
function getValidAccessToken(secrets) {
  if (!secrets?.access_token) return null;
  // Treat a missing expires_at as already expired so we always attempt a refresh rather than
  // using a potentially stale access token indefinitely.
  const expiresAt = typeof secrets.expires_at === "number" ? secrets.expires_at : 0;
  if (expiresAt < Date.now() + 30_000) return null;
  return secrets.access_token;
}

/**
 * List one page of a Dropbox folder.
 * @param {string} accessToken
 * @param {{ path?: string; cursor?: string; recursive?: boolean }} opts
 * @returns {Promise<{ ok: true; entries: object[]; cursor: string; hasMore: boolean } | { ok: false; reason: string }>}
 */
async function listDropboxFolder(accessToken, { path: folderPath = "", cursor, recursive = true } = {}) {
  const t0 = Date.now();
  try {
    let url, bodyJson;
    if (cursor) {
      url = DROPBOX_LIST_FOLDER_CONTINUE;
      bodyJson = { cursor };
    } else {
      url = DROPBOX_LIST_FOLDER;
      bodyJson = {
        path: folderPath === "" ? "" : folderPath,
        recursive,
        include_deleted: false,
        include_media_info: false,
        include_mounted_folders: true,
        limit: 500,
      };
    }
    const res = await withTimeout("dropbox_list", DROPBOX_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyJson),
        signal,
      })
    );
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = {}; }
    if (!res.ok) {
      console.log("[dropbox:list] failed", {
        status: res.status,
        elapsedMs: Date.now() - t0,
        reason: json.error_summary || `http_${res.status}`,
      });
      return { ok: false, reason: json.error_summary || `http_${res.status}` };
    }
    const entries = Array.isArray(json.entries) ? json.entries : [];
    console.log("[dropbox:list] ok", {
      entryCount: entries.length,
      hasMore: Boolean(json.has_more),
      elapsedMs: Date.now() - t0,
    });
    return {
      ok: true,
      entries,
      cursor: String(json.cursor || ""),
      hasMore: Boolean(json.has_more),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download a Dropbox file into destDir. Skips files larger than DROPBOX_IMPORT_MAX_BYTES_PER_FILE.
 * @param {string} accessToken
 * @param {{ path: string; name: string; size?: number }} entry
 * @param {string} destDir
 * @param {Set<string>} usedNames — deduplicate filenames within one staging dir
 * @returns {Promise<{ ok: true; localPath: string } | { ok: false; reason: string }>}
 */
async function downloadDropboxFile(accessToken, entry, destDir, usedNames) {
  const sizeBytes = typeof entry.size === "number" ? entry.size : 0;
  if (sizeBytes > DROPBOX_IMPORT_MAX_BYTES_PER_FILE) {
    return { ok: false, reason: "file_too_large" };
  }

  // Safe, unique filename within this staging dir.
  let baseName = path.basename(entry.name).replace(/[\\/:*?"<>|]/g, "_") || "file";
  if (usedNames.has(baseName)) {
    const ext = path.extname(baseName);
    const stem = path.basename(baseName, ext);
    let i = 2;
    while (usedNames.has(`${stem}_${i}${ext}`)) i++;
    baseName = `${stem}_${i}${ext}`;
  }
  usedNames.add(baseName);
  const localPath = path.join(destDir, baseName);

  try {
    const res = await withTimeout("dropbox_download", DROPBOX_DOWNLOAD_TIMEOUT_MS, (signal) =>
      fetch(DROPBOX_DOWNLOAD, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({ path: entry.path_lower || entry.path_display }),
        },
        signal,
      })
    );
    if (!res.ok) {
      let reason = `http_${res.status}`;
      try {
        const hdr = res.headers.get("dropbox-api-result");
        const j = hdr ? JSON.parse(hdr) : await res.json();
        reason = j.error_summary || reason;
      } catch {}
      return { ok: false, reason };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(localPath, buf);
    return { ok: true, localPath };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Download a batch of Dropbox entries (by path) into a staging directory.
 * @param {string} accessToken
 * @param {{ path_lower: string; path_display?: string; name: string; size?: number }[]} entries
 * @param {string} destDir
 * @returns {Promise<{ ok: true; localPaths: string[]; stagingDir: string; failed: { path: string; reason: string }[] } | { ok: false; reason: string }>}
 */
async function importDropboxFilesToDirectory(accessToken, entries, destDir) {
  const validEntries = (entries || []).filter((e) => e && e.path_lower);
  if (validEntries.length === 0) return { ok: false, reason: "no_entries" };

  await fs.mkdir(destDir, { recursive: true });
  const localPaths = [];
  const failed = [];
  const usedNames = new Set();

  for (let i = 0; i < validEntries.length; i++) {
    const entry = validEntries[i];
    console.log("[dropbox:import] file_start", {
      index: i + 1,
      total: validEntries.length,
      path: entry.path_lower,
    });
    const r = await downloadDropboxFile(accessToken, entry, destDir, usedNames);
    if (r.ok) {
      localPaths.push(r.localPath);
      console.log("[dropbox:import] file_done", {
        index: i + 1,
        total: validEntries.length,
        path: entry.path_lower,
        bytes: (await fs.stat(r.localPath).catch(() => ({ size: 0 }))).size,
      });
    } else {
      failed.push({ path: entry.path_lower, reason: r.reason });
      console.log("[dropbox:import] file_failed", {
        index: i + 1,
        total: validEntries.length,
        path: entry.path_lower,
        reason: r.reason,
      });
    }
  }
  return { ok: true, localPaths, stagingDir: destDir, failed };
}

/**
 * Lightweight health check — returns the account email if the token is valid.
 * @param {string} accessToken
 * @returns {Promise<{ ok: true; email?: string } | { ok: false; reason: string }>}
 */
async function dropboxAccountHealth(accessToken) {
  try {
    const res = await withTimeout("dropbox_health", DROPBOX_METADATA_TIMEOUT_MS, (signal) =>
      fetch(DROPBOX_GET_CURRENT_ACCOUNT, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const json = await res.json();
    return { ok: true, email: json?.email };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Build the Dropbox staging directory path for a sort job.
 * @param {string} jobId
 */
function dropboxStagingDir(jobId) {
  return path.join(
    require("../accountProfile").resolveProfileRoot(),
    "dropbox_sort_staging",
    jobId.replace(/[^a-zA-Z0-9_-]/g, "")
  );
}

module.exports = {
  connectDropboxPkce,
  refreshDropboxTokens,
  getValidAccessToken,
  listDropboxFolder,
  importDropboxFilesToDirectory,
  dropboxAccountHealth,
  dropboxStagingDir,
  getAppKey,
};
