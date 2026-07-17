/** Native file / folder pickers. */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const { ipcMain, dialog } = require("electron");
const { DIALOG_FILE_FILTERS } = require("../constants");
const { getDialogWindow } = require("./dialogWindow");
const {
  recordAuthorizedPath,
  recordAuthorizedParentDirs,
  isSafeUserContentPath,
} = require("../authorizedPaths");
const { isTrustedSender } = require("./senderGuard");
const {
  classifyAttachmentExt,
  mimeForImageExt,
  HEIC_EXT,
} = require("../composer/attachmentClassify");
const { extractDocumentViaBackend } = require("../composer/extractDocumentViaBackend");

/** Max bytes for inline text read (matches ExoFileDropZone 500 KB cap). */
const COMPOSER_ATTACHMENT_MAX_BYTES = 500_000;
/** Images can be larger — still capped so chat storage stays sane. */
const COMPOSER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Convert HEIC/HEIF → JPEG via macOS `sips` (Chromium cannot preview HEIC in <img>).
 * @param {string} resolved
 * @returns {Promise<Buffer | null>}
 */
function convertHeicToJpegBuffer(resolved) {
  if (process.platform !== "darwin") return Promise.resolve(null);
  const out = path.join(
    os.tmpdir(),
    `exo-composer-heic-${process.pid}-${Date.now()}.jpg`,
  );
  return new Promise((resolve) => {
    const child = spawn(
      "sips",
      ["-s", "format", "jpeg", resolved, "--out", out],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 30_000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const buf = await fs.promises.readFile(out);
        resolve(buf);
      } catch {
        resolve(null);
      } finally {
        try {
          fs.unlinkSync(out);
        } catch {
          /* ignore */
        }
      }
    });
  });
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
    for (const p of result.filePaths) recordAuthorizedPath(p);
    recordAuthorizedParentDirs(result.filePaths);
    return result.filePaths;
  });

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

  /**
   * Read a file/folder/image/document for the assistant composer.
   * Documents are extracted via the local backend (no raw binary in the renderer).
   */
  ipcMain.handle("dialog:readComposerAttachment", async (event, filePath) => {
    if (!isTrustedSender(event)) {
      return { ok: false, reason: "untrusted_sender" };
    }
    if (!isSafeUserContentPath(filePath)) {
      return { ok: false, reason: "Path not allowed" };
    }
    try {
      const resolved = path.resolve(String(filePath).trim());
      const st = await fs.promises.stat(resolved);
      const basename = path.basename(resolved);
      if (st.isDirectory()) {
        return { ok: true, kind: "directory", basename, pathText: resolved };
      }
      const ext = path.extname(resolved).toLowerCase();
      const kind = classifyAttachmentExt(ext);

      if (kind === "video") {
        return { ok: true, kind: "video", basename };
      }

      if (kind === "image" || kind === "heic") {
        if (st.size > COMPOSER_IMAGE_MAX_BYTES) {
          return { ok: true, kind: "file_too_large", basename };
        }
        if (HEIC_EXT.has(ext)) {
          const jpegBuf = await convertHeicToJpegBuffer(resolved);
          if (!jpegBuf) {
            return { ok: true, kind: "binary", basename, reason: "heic_convert_failed" };
          }
          return {
            ok: true,
            kind: "image",
            basename,
            dataUrl: `data:image/jpeg;base64,${jpegBuf.toString("base64")}`,
          };
        }
        const buf = await fs.promises.readFile(resolved);
        const mime = mimeForImageExt(ext);
        return {
          ok: true,
          kind: "image",
          basename,
          dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
        };
      }

      if (kind === "document" || kind === "text") {
        // Prefer backend extract for PDF/Office; plain text can still go through backend
        // for consistent caps, or inline when tiny.
        if (kind === "text" && st.size <= COMPOSER_ATTACHMENT_MAX_BYTES) {
          const buf = await fs.promises.readFile(resolved);
          if (!buf.includes(0)) {
            return {
              ok: true,
              kind: "document",
              basename,
              text: buf.toString("utf8").slice(0, 32_000),
              truncated: buf.length > 32_000,
              pages: null,
              source: "text_inline",
            };
          }
        }
        return extractDocumentViaBackend(resolved);
      }

      // Unknown binary
      if (st.size > COMPOSER_ATTACHMENT_MAX_BYTES) {
        return { ok: true, kind: "file_too_large", basename };
      }
      const buf = await fs.promises.readFile(resolved);
      if (buf.includes(0)) {
        return { ok: true, kind: "binary", basename, reason: "unsupported_type" };
      }
      return { ok: true, kind: "file", basename, text: buf.toString("utf8") };
    } catch (err) {
      return { ok: false, reason: String(err?.message ?? err) };
    }
  });
}

module.exports = { registerDialogHandlers };
