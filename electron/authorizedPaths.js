/**
 * Main-process registry of folders the user has explicitly granted access to.
 *
 * The renderer cannot be trusted to self-attest which paths are authorized
 * (a compromised renderer could ask the main process to open or write to any
 * absolute path). Instead, every folder the user picks through a native dialog
 * is recorded here, and privileged file operations validate their target
 * against this store plus a small set of known-safe roots (userData, home).
 *
 * Sensitive subtrees (.ssh, .gnupg) are always denied.
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { app } = require("electron");

const STORE_FILE = "authorized_paths_v1.json";

/** @type {Set<string> | null} */
let cache = null;

function storePath() {
  return path.join(app.getPath("userData"), STORE_FILE);
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

function isBlockedSensitive(resolved) {
  const home = os.homedir();
  const blocked = [path.join(home, ".ssh"), path.join(home, ".gnupg")];
  return blocked.some((b) => isUnder(resolved, b));
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
 * write to: under userData, under a previously granted folder, or under the
 * user's home directory — and never inside a blocked sensitive subtree.
 * @param {string} targetPath
 * @returns {boolean}
 */
function isAuthorizedFolder(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) return false;
  let resolved;
  try {
    resolved = path.resolve(targetPath.trim());
  } catch {
    return false;
  }
  if (isBlockedSensitive(resolved)) return false;

  const userData = app.getPath("userData");
  if (isUnder(resolved, userData)) return true;

  for (const granted of load()) {
    if (isUnder(resolved, granted)) return true;
  }

  const home = os.homedir();
  return isUnder(resolved, home);
}

module.exports = {
  recordAuthorizedPath,
  recordAuthorizedParentDirs,
  isAuthorizedFolder,
};
