/**
 * Narrow allowlist for local filesystem paths the renderer may open via IPC.
 * Replaces trusting all of $HOME — only known app-owned roots are permitted.
 */

const path = require("path");
const os = require("os");
const { app } = require("electron");
const { APP_NAME } = require("./constants");

/** Subdirs under profile/userData used for cloud-import staging (sync with PROFILE_STAGING_DIRS). */
const STAGING_DIR_NAMES = new Set([
  "drive_sort_staging",
  "dropbox_sort_staging",
  "onedrive_sort_staging",
  "outlook_sort_staging",
  "box_sort_staging",
  "s3_sort_staging",
  "slack_sort_staging",
  "icloud_sort_staging",
  "infomaniak_sort_staging",
  "infomaniak_mail_sort_staging",
  "gmail_imports",
  "browser_uploads",
]);

const BLOCKED_HOME_SUBDIRS = [".ssh", ".gnupg", ".aws", ".azure"];

/**
 * @returns {string[]}
 */
function trustedLocalRoots() {
  const roots = [];
  try {
    roots.push(app.getPath("userData"));
  } catch {
    /* app not ready */
  }
  const home = os.homedir();
  roots.push(path.join(home, "Documents", `${APP_NAME} Sorted Files`));
  roots.push(path.join(home, ".ai-manager", "studio"));
  return roots.filter(Boolean);
}

/**
 * @param {string} resolved absolute path
 * @param {string} root
 * @returns {boolean}
 */
function isUnderRoot(resolved, root) {
  const normalizedRoot = path.resolve(root);
  return resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep);
}

/**
 * @param {string | null | undefined} filePath
 * @returns {boolean}
 */
function isTrustedLocalPath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) return false;
  let resolved;
  try {
    resolved = path.resolve(filePath.trim());
  } catch {
    return false;
  }

  const home = os.homedir();
  for (const blocked of BLOCKED_HOME_SUBDIRS) {
    const blockedPath = path.join(home, blocked);
    if (resolved === blockedPath || resolved.startsWith(blockedPath + path.sep)) {
      return false;
    }
  }

  for (const root of trustedLocalRoots()) {
    if (isUnderRoot(resolved, root)) return true;
  }

  return false;
}

module.exports = {
  STAGING_DIR_NAMES,
  trustedLocalRoots,
  isTrustedLocalPath,
};
