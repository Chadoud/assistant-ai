import { hasElectronBridge } from "../../utils/platform";

interface WorkspaceBatchSourceFlags {
  driveOn: boolean;
  dropboxOn: boolean;
  oneDriveOn: boolean;
  outlookOn: boolean;
  infomaniakMailOn: boolean;
}

/**
 * When a selected cloud source needs desktop IPC that is missing, return the i18n toast key.
 */
export function workspaceBatchDesktopUnavailableMessageKey(
  flags: WorkspaceBatchSourceFlags,
): string | null {
  const desktop = hasElectronBridge();

  if (
    flags.driveOn &&
    (!desktop ||
      typeof window.electronAPI?.integrationImportGoogleDriveFiles !== "function" ||
      typeof window.electronAPI?.integrationListGoogleDriveFiles !== "function")
  ) {
    return "queue.workspaceBatchDriveUnavailable";
  }

  if (
    flags.dropboxOn &&
    (!desktop ||
      typeof window.electronAPI?.integrationImportDropboxFiles !== "function" ||
      typeof window.electronAPI?.integrationListDropboxFiles !== "function")
  ) {
    return "queue.workspaceBatchDropboxUnavailable";
  }

  if (
    flags.oneDriveOn &&
    (!desktop ||
      typeof window.electronAPI?.integrationImportOneDriveFiles !== "function" ||
      typeof window.electronAPI?.integrationListOneDriveFiles !== "function")
  ) {
    return "queue.workspaceBatchOneDriveUnavailable";
  }

  if (
    flags.outlookOn &&
    (!desktop ||
      typeof window.electronAPI?.integrationImportOutlookMessages !== "function" ||
      typeof window.electronAPI?.integrationListOutlookMessages !== "function")
  ) {
    return "queue.workspaceBatchOutlookUnavailable";
  }

  if (
    flags.infomaniakMailOn &&
    (!desktop ||
      typeof window.electronAPI?.integrationImportInfomaniakMailMessages !== "function" ||
      typeof window.electronAPI?.integrationListInfomaniakMailMessages !== "function")
  ) {
    return "queue.workspaceBatchInfomaniakMailUnavailable";
  }

  return null;
}
