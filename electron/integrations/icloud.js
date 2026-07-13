/**
 * iCloud Drive local-folder integration.
 *
 * iCloud Drive does not expose a public third-party API on Windows.
 * This integration works by letting the user point to their local iCloud sync folder:
 *   - Windows: typically %USERPROFILE%\iCloudDrive (iCloud for Windows)
 *   - macOS:   ~/Library/Mobile Documents/com~apple~CloudDocs
 *
 * Files are read directly from the local filesystem — no OAuth, no API keys.
 */

const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { app, dialog } = require("electron");
const {
  WORKSPACE_CLOUD_RECURSE_MAX_FILES: ICLOUD_RECURSE_MAX_FILES,
  WORKSPACE_CLOUD_RECURSE_MAX_FOLDER_LISTINGS: ICLOUD_RECURSE_MAX_DIRS,
} = require("./workspaceRecurseCaps");

const ICLOUD_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

const ICLOUD_PROVIDER_KEY = "icloud";

/** Platform-specific default paths for the iCloud Drive sync folder. */
function defaultICloudPath() {
  if (process.platform === "win32") {
    return path.join(os.homedir(), "iCloudDrive");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");
  }
  // Linux: not officially supported by iCloud; return home as fallback.
  return os.homedir();
}

/**
 * Open a folder picker dialog so the user can point to their iCloud Drive folder.
 * Returns the selected path, or null if cancelled.
 * @param {Electron.BrowserWindow | null} parentWindow
 * @returns {Promise<string | null>}
 */
async function pickICloudFolder(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow || undefined, {
    title: "Select iCloud Drive Folder",
    defaultPath: defaultICloudPath(),
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

/**
 * Check whether the configured folder exists and is accessible.
 * @param {{ folder: string }} settings
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function icloudFolderHealth(settings) {
  if (!settings?.folder) return { ok: false, reason: "no_folder_configured" };
  try {
    const stat = await fs.stat(settings.folder);
    if (!stat.isDirectory()) return { ok: false, reason: "path_is_not_directory" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "folder_not_accessible" };
  }
}

function icloudSettingsLooksUsable(settings) {
  return !!settings?.folder;
}

/**
 * Recursively list all files under `rootDir`.
 * @param {string} rootDir
 * @returns {Promise<{ ok: true; files: object[]; capped: boolean } | { ok: false; reason: string }>}
 */
async function listICloudFiles(rootDir) {
  if (!rootDir) return { ok: false, reason: "no_root_dir" };

  try {
    await fs.access(rootDir);
  } catch {
    return { ok: false, reason: "folder_not_accessible" };
  }

  const files = [];
  const dirQueue = [rootDir];
  let dirsVisited = 0;
  let capped = false;

  while (dirQueue.length > 0) {
    const dir = dirQueue.shift();
    dirsVisited++;
    if (dirsVisited > ICLOUD_RECURSE_MAX_DIRS) {
      capped = true;
      break;
    }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      // Skip hidden files and iCloud placeholder files (.icloud extension)
      if (entry.name.startsWith(".")) continue;
      if (entry.name.endsWith(".icloud")) continue;

      if (entry.isDirectory()) {
        dirQueue.push(fullPath);
      } else if (entry.isFile()) {
        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        files.push({
          path: fullPath,
          name: entry.name,
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
        });
        if (files.length >= ICLOUD_RECURSE_MAX_FILES) {
          capped = true;
          break;
        }
      }
    }
    if (capped) break;
  }

  return { ok: true, files, capped };
}

/**
 * "Import" iCloud files to a staging dir — just copies them since they are local.
 * @param {object[]} items  Array of { path, name, size }
 * @param {string} stagingDir
 */
async function importICloudFilesToDirectory(items, stagingDir) {
  await fs.mkdir(stagingDir, { recursive: true });
  const localPaths = [];
  const failed = [];

  for (const item of items) {
    if (!item?.path || !item?.name) {
      failed.push({ path: item?.path || "unknown", reason: "invalid_item" });
      continue;
    }
    const size = Number(item.size || 0);
    if (size > ICLOUD_IMPORT_MAX_BYTES) {
      failed.push({ path: item.path, reason: "too_large" });
      continue;
    }
    const destPath = path.join(stagingDir, sanitizeFilename(item.name));
    try {
      await fs.copyFile(item.path, destPath);
      localPaths.push(destPath);
    } catch (e) {
      failed.push({ path: item.path, reason: e.message || "copy_failed" });
    }
  }

  return { ok: true, localPaths, failed, stagingDir };
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200);
}

function icloudStagingDir(jobId) {
  return path.join(app.getPath("userData"), "icloud_sort_staging", jobId);
}

module.exports = {
  ICLOUD_PROVIDER_KEY,
  defaultICloudPath,
  pickICloudFolder,
  icloudFolderHealth,
  icloudSettingsLooksUsable,
  listICloudFiles,
  importICloudFilesToDirectory,
  icloudStagingDir,
};
