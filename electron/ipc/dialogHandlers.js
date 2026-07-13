/** Native file / folder pickers. */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { ipcMain, dialog, app } = require("electron");
const { DIALOG_FILE_FILTERS } = require("../constants");
const { getDialogWindow } = require("./dialogWindow");
const { recordAuthorizedPath, recordAuthorizedParentDirs } = require("../authorizedPaths");

/** Max bytes for inline text read (matches ExoFileDropZone 500 KB cap). */
const COMPOSER_ATTACHMENT_MAX_BYTES = 500_000;

/**
 * Identical trust check to shellHandlers — allows reads only under userData or the user's home.
 * Defined here rather than imported to avoid a cross-handler import cycle.
 */
function isAttachmentPathTrusted(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) return false;
  try {
    const resolved = path.resolve(filePath.trim());
    const ud = app.getPath("userData");
    const home = os.homedir();
    const blocked = [
      path.join(home, ".ssh"),
      path.join(home, ".gnupg"),
    ];
    if (blocked.some((b) => resolved === b || resolved.startsWith(b + path.sep))) return false;
    return resolved.startsWith(ud + path.sep) || resolved.startsWith(home + path.sep) || resolved === home;
  } catch {
    return false;
  }
}

function registerDialogHandlers() {
  ipcMain.handle("dialog:openFiles", async () => {
    const win = getDialogWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "multiSelections"],
      filters: DIALOG_FILE_FILTERS,
    });
    if (result.canceled) return [];
    recordAuthorizedParentDirs(result.filePaths);
    return result.filePaths;
  });

  ipcMain.handle("dialog:openFilesOrFolders", async () => {
    const win = getDialogWindow();
    if (!win) return [];
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile", "openDirectory", "multiSelections", "createDirectory"],
      filters: DIALOG_FILE_FILTERS,
    });
    if (result.canceled) return [];
    // A selection may be files or directories; authorize directories directly
    // and the parent of each file.
    for (const p of result.filePaths) recordAuthorizedPath(p);
    recordAuthorizedParentDirs(result.filePaths);
    return result.filePaths;
  });

  /**
   * Pick a folder for output / imports. `createDirectory` enables “New Folder” on macOS;
   * on Windows/Linux the system picker still offers creating folders where the OS supports it.
   */
  ipcMain.handle("dialog:openDirectory", async (_event, options = {}) => {
    const win = getDialogWindow();
    if (!win) return null;
    const title =
      typeof options.title === "string" && options.title.trim()
        ? options.title.trim()
        : "Choose folder";
    const defaultPath =
      typeof options.defaultPath === "string" && options.defaultPath.trim()
        ? options.defaultPath.trim()
        : undefined;
    const buttonLabel =
      typeof options.buttonLabel === "string" && options.buttonLabel.trim()
        ? options.buttonLabel.trim()
        : undefined;
    const result = await dialog.showOpenDialog(win, {
      title,
      defaultPath,
      buttonLabel,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return null;
    const picked = result.filePaths[0];
    recordAuthorizedPath(picked);
    return picked;
  });
}

  /**
   * Read a file or folder chosen by the user as a text snippet for the assistant composer.
   * Returns a typed result consumed by the renderer; never throws to the renderer.
   */
  ipcMain.handle("dialog:readComposerAttachment", async (_event, filePath) => {
    if (!isAttachmentPathTrusted(filePath)) {
      return { ok: false, reason: "Path not allowed" };
    }
    try {
      const resolved = path.resolve(filePath.trim());
      const st = await fs.promises.stat(resolved);
      const basename = path.basename(resolved);
      if (st.isDirectory()) {
        return { ok: true, kind: "directory", basename, pathText: resolved };
      }
      if (st.size > COMPOSER_ATTACHMENT_MAX_BYTES) {
        return { ok: true, kind: "file_too_large", basename };
      }
      const text = await fs.promises.readFile(resolved, "utf8");
      return { ok: true, kind: "file", basename, text };
    } catch (err) {
      return { ok: false, reason: String(err?.message ?? err) };
    }
  });


module.exports = { registerDialogHandlers };
