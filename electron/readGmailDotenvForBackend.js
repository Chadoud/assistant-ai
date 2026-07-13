/**
 * Read selected OAuth/.env lines from standard locations and pass them into the Python child process,
 * and into Electron main via ``syncGoogleOauthClientIdForElectronMain`` (same subset).
 * Mirrors keys so ``backend/.env`` works without manual copy-paste for integrations.
 */

const fs = require("fs");
const path = require("path");

/** Keys merged into the backend process env (only these; never the whole .env). */
const GMAIL_BACKEND_ENV_KEYS = new Set([
  "EXOSITES_CLOUD_URL",
  "EXOSITES_GOOGLE_CLIENT_ID",
  "EXOSITES_GOOGLE_CLIENT_SECRET",
  "EXOSITES_GOOGLE_OAUTH_CLIENT_JSON",
  "EXOSITES_GMAIL_OAUTH_PORT",
  "EXOSITES_GMAIL_OAUTH_REDIRECT_URI",
  "EXOSITES_DROPBOX_APP_KEY",
  "EXOSITES_MICROSOFT_OAUTH_CLIENT_ID",
  "EXOSITES_INFOMANIAK_CLIENT_ID",
  "EXOSITES_INFOMANIAK_CLIENT_SECRET",
  "EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT",
  "EXOSITES_INFOMANIAK_OAUTH_SCOPE",
  "EXOSITES_INFOMANIAK_DRIVE_OAUTH_SCOPE",
  "EXOSITES_INFOMANIAK_CALENDAR_OAUTH_SCOPE",
  "EXOSITES_NOTION_CLIENT_ID",
  "EXOSITES_NOTION_CLIENT_SECRET",
  "EXOSITES_SLACK_CLIENT_ID",
  "EXOSITES_SLACK_CLIENT_SECRET",
]);

/**
 * Parse a single .env file into key/value pairs (tolerant of BOM, export prefix, quotes, # in unquoted values).
 *
 * @param {string} filePath
 * @param {ReadonlySet<string>} [allowedKeys] Defaults to keys forwarded to the backend child process.
 * @returns {Record<string, string>}
 */
function parseDotenvFile(filePath, allowedKeys = GMAIL_BACKEND_ENV_KEYS) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return out;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const rawLine of raw.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.toLowerCase().startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).replace(/\r/g, "").trim();
    if (!k || !allowedKeys.has(k)) continue;
    let v = line.slice(eq + 1).trim();
    if (v.includes("#") && !v.startsWith('"')) v = v.split("#")[0].trim();
    if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
      v = v.slice(1, -1).trim();
    }
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Merge Gmail-related vars from standard .env locations (later paths override earlier ones).
 *
 * @param {{ isDev: boolean; backendDir: string; resourcesPath: string; userData?: string }} opts
 * @returns {Record<string, string>}
 */
function readGmailRelatedEnvForBackendSpawn(opts) {
  const { isDev, backendDir, resourcesPath, userData } = opts;
  /** @type {string[]} */
  const files = [];
  if (isDev) {
    files.push(path.join(backendDir, ".env"));
  } else {
    files.push(path.join(resourcesPath, ".env"));
    if (userData) files.push(path.join(userData, ".env"));
  }
  const merged = {};
  for (const p of files) {
    const chunk = parseDotenvFile(p);
    Object.assign(merged, chunk);
  }
  return merged;
}

/** Not forwarded to the Python backend — only merged into Electron main `process.env`. */
const INFOMANIAK_TOKEN_ENV_KEYS = new Set(["EXOSITES_INFOMANIAK_TOKEN"]);

/**
 * Read `EXOSITES_INFOMANIAK_TOKEN` from the same .env locations as other integration keys
 * (dev: `backend/.env`; packaged: `resources/.env` then `userData/.env`).
 *
 * @param {{ isDev: boolean; backendDir: string; resourcesPath: string; userData?: string }} opts
 * @returns {string} trimmed token or empty string
 */
function readInfomaniakTokenForElectronMain(opts) {
  const { isDev, backendDir, resourcesPath, userData } = opts;
  /** @type {string[]} */
  const files = [];
  if (isDev) {
    files.push(path.join(backendDir, ".env"));
  } else {
    files.push(path.join(resourcesPath, ".env"));
    if (userData) files.push(path.join(userData, ".env"));
  }
  let token = "";
  for (const p of files) {
    const chunk = parseDotenvFile(p, INFOMANIAK_TOKEN_ENV_KEYS);
    const t = (chunk.EXOSITES_INFOMANIAK_TOKEN || "").trim();
    if (t) token = t;
  }
  return token;
}

/**
 * Remove `EXOSITES_INFOMANIAK_TOKEN` from `.env` file(s) on disk and from `process.env`.
 *
 * Called when the user explicitly disconnects kDrive or Calendar so the Disconnect button
 * works end-to-end without requiring manual `.env` edits or an app restart.
 *
 * Best-effort on each file: if a file cannot be written the in-memory clear still takes effect.
 *
 * @param {{ isDev: boolean; backendDir: string; resourcesPath: string; userData?: string }} opts
 */
function clearInfomaniakEnvTokenFromDotenv(opts) {
  const { isDev, backendDir, resourcesPath, userData } = opts;
  const files = isDev
    ? [path.join(backendDir, ".env")]
    : [
        path.join(resourcesPath, ".env"),
        ...(userData ? [path.join(userData, ".env")] : []),
      ];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const original = fs.readFileSync(filePath, "utf8");
      const eol = original.includes("\r\n") ? "\r\n" : "\n";
      const updated = original
        .split(/\r?\n/)
        .filter((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return true;
          const withoutExport = trimmed.replace(/^export\s+/i, "");
          const key = withoutExport.slice(0, withoutExport.indexOf("=")).trim();
          return key !== "EXOSITES_INFOMANIAK_TOKEN";
        })
        .join(eol);
      if (updated !== original) {
        fs.writeFileSync(filePath, updated, "utf8");
      }
    } catch {
      // Best-effort — in-memory clear below still takes immediate effect.
    }
  }

  delete process.env.EXOSITES_INFOMANIAK_TOKEN;
}

module.exports = {
  readGmailRelatedEnvForBackendSpawn,
  readInfomaniakTokenForElectronMain,
  clearInfomaniakEnvTokenFromDotenv,
  parseDotenvFile,
  GMAIL_BACKEND_ENV_KEYS,
};
