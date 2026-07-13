/**
 * Detect when the packaged Mac app is running from a mounted .dmg instead of /Applications.
 */

const path = require("path");

/**
 * @returns {boolean} True on macOS when the executable lives under /Volumes/ (mounted disk image).
 */
function isRunningFromMountedVolume(execPath = process.execPath) {
  if (process.platform !== "darwin") return false;
  return String(execPath).startsWith("/Volumes/");
}

/**
 * @returns {boolean} True when the app bundle is under /Applications/.
 */
function isInstalledInApplications(execPath = process.execPath) {
  if (process.platform !== "darwin") return true;
  return String(execPath).includes("/Applications/");
}

/**
 * @param {string} [execPath]
 * @returns {{ runningFromMountedVolume: boolean; installedInApplications: boolean; showInstallHint: boolean }}
 */
function getInstallLocationState(execPath = process.execPath) {
  const runningFromMountedVolume = isRunningFromMountedVolume(execPath);
  const installedInApplications = isInstalledInApplications(execPath);
  return {
    runningFromMountedVolume,
    installedInApplications,
    showInstallHint: runningFromMountedVolume && !installedInApplications,
  };
}

/**
 * Opens the system Applications folder so the user can finish drag-install.
 * @returns {Promise<string>} shell.openPath result (empty string on success).
 */
async function openApplicationsFolder() {
  const { shell } = require("electron");
  return shell.openPath("/Applications");
}

module.exports = {
  isRunningFromMountedVolume,
  isInstalledInApplications,
  getInstallLocationState,
  openApplicationsFolder,
};
