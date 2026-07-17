/**
 * Main-process registry of folders the user has explicitly granted access to.
 *
 * The renderer cannot be trusted to self-attest which paths are authorized
 * (a compromised renderer could ask the main process to open or write to any
 * absolute path). Instead, every folder the user picks through a native dialog
 * is recorded here, and privileged file operations validate their target
 * against this store plus known-safe roots (userData only — not the whole home).
 *
 * Sensitive subtrees (.ssh, .gnupg) and app secret leaves under userData are
 * always denied. Content reads (composer / agent read_file) require a dialog
 * grant and never allow the userData tree.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { app } = require("electron");

const STORE_FILE = "authorized_paths_v1.json";

/** App secret leaves / dirs under userData that must never be content-read. */
const APP_SECRET_NAMES = new Set([
  "settings_secrets_v1",
  "gmail_oauth.json",
  "sync_master_key.enc",
]);

/** @type {Set<string> | null} */
let cache = null;

function storePath() {
  return path.join(require("./accountProfile").resolveProfileRoot(), STORE_FILE);
}

function load() {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    cache = new Set(
      Array.isArray(parsed?.paths) ? parsed.paths.filter((p) => typeof p === "string") : []
    );
  } catch {
    cache = new Set();
  }
  return cache;
}

function persist() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify({ v: 1, paths: [...load()] }), "utf8");
  } catch (err) {
    console.warn("[authorizedPaths] failed to persist store:", err?.message ?? err);
  }
}

function isUnder(child, parent) {
  return child === parent || child.startsWith(parent + path.sep);
}

function resolvePath(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) return null;
  try {
    return path.resolve(targetPath.trim());
  } catch {
    return null;
  }
}

function isBlockedSensitive(resolved) {
  const home = os.homedir();
  const blocked = [path.join(home, ".ssh"), path.join(home, ".gnupg")];
  return blocked.some((b) => isUnder(resolved, b));
}

/**
 * True when resolved path is an app secret file/dir under userData
 * (or matches those basenames under userData).
 * @param {string} resolved
 */
function isBlockedAppSecret(resolved) {
  let userData;
  try {
    userData = app.getPath("userData");
  } catch {
    return false;
  }
  if (!isUnder(resolved, userData)) return false;
  const rel = path.relative(userData, resolved);
  if (!rel || rel.startsWith("..")) return false;
  const parts = rel.split(path.sep);
  return parts.some((part) => APP_SECRET_NAMES.has(part));
}

function isUnderDialogGrant(resolved) {
  for (const granted of load()) {
    if (isUnder(resolved, granted)) return true;
  }
  return false;
}

/**
 * Record a folder the user picked through a native dialog. For files, pass the
 * containing directory. Idempotent; persists on first insert.
 * @param {string} folderPath
 */
function recordAuthorizedPath(folderPath) {
  if (typeof folderPath !== "string" || !folderPath.trim()) return;
  let resolved;
  try {
    resolved = path.resolve(folderPath.trim());
  } catch {
    return;
  }
  const set = load();
  if (!set.has(resolved)) {
    set.add(resolved);
    persist();
  }
}

/**
 * Record the directories that contain the given picked file paths.
 * @param {string[]} filePaths
 */
function recordAuthorizedParentDirs(filePaths) {
  if (!Array.isArray(filePaths)) return;
  for (const f of filePaths) {
    if (typeof f === "string" && f.trim()) recordAuthorizedPath(path.dirname(f));
  }
}

/**
 * True when `targetPath` resolves to a location the user is allowed to open or
 * write to: under userData or under a previously granted folder — never under
 * a blocked sensitive subtree, and never merely because it is under $HOME (M2.8).
 * @param {string} targetPath
 * @returns {boolean}
 */
function isAuthorizedFolder(targetPath) {
  const resolved = resolvePath(targetPath);
  if (!resolved) return false;
  if (isBlockedSensitive(resolved) || isBlockedAppSecret(resolved)) return false;

  const userData = app.getPath("userData");
  if (isUnder(resolved, userData)) return true;

  return isUnderDialogGrant(resolved);
}

/**
 * True when content may be read into the renderer or agent tools (composer
 * attachment, read_file, list_directory). Requires a prior native-dialog grant;
 * never allows the Electron userData tree (even non-secret leaves).
 * @param {string} targetPath
 * @returns {boolean}
 */
function isSafeUserContentPath(targetPath) {
  const resolved = resolvePath(targetPath);
  if (!resolved) return false;
  if (isBlockedSensitive(resolved) || isBlockedAppSecret(resolved)) return false;

  const userData = app.getPath("userData");
  if (isUnder(resolved, userData)) return false;

  return isUnderDialogGrant(resolved);
}

/** Test-only: reset in-memory cache between cases. */
function resetAuthorizedPathsCacheForTests() {
  cache = null;
}

module.exports = {
  recordAuthorizedPath,
  recordAuthorizedParentDirs,
  isAuthorizedFolder,
  isSafeUserContentPath,
  isBlockedAppSecret,
  resetAuthorizedPathsCacheForTests,
};
