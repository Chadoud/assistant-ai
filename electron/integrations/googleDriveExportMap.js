/**
 * Pure helpers for Google Workspace file export targets (Drive API ``files.export``).
 * Kept separate from ``google.js`` so unit tests do not load OAuth / fetch.
 */

const MIME_GDOC = "application/vnd.google-apps.document";
const MIME_GSHEET = "application/vnd.google-apps.spreadsheet";
const MIME_GSLIDES = "application/vnd.google-apps.presentation";
const MIME_GDRAW = "application/vnd.google-apps.drawing";

/**
 * @param {string} raw
 * @param {string} [ext]
 */
function safeLocalBasename(raw, ext) {
  const base = String(raw || "file")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\.+$/, "")
    .trim() || "file";
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) {
    return `${base}${ext}`;
  }
  return base;
}

/**
 * @param {string} mimeType
 * @returns {{ exportMime: string, ext: string } | null}
 */
function googleAppExportTarget(mimeType) {
  if (mimeType === MIME_GDOC) {
    return { exportMime: "application/pdf", ext: ".pdf" };
  }
  if (mimeType === MIME_GSHEET) {
    return {
      exportMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: ".xlsx",
    };
  }
  if (mimeType === MIME_GSLIDES) {
    return { exportMime: "application/pdf", ext: ".pdf" };
  }
  if (mimeType === MIME_GDRAW) {
    return { exportMime: "image/png", ext: ".png" };
  }
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    return { exportMime: "application/pdf", ext: ".pdf" };
  }
  return null;
}

module.exports = {
  safeLocalBasename,
  googleAppExportTarget,
  MIME_GDOC,
  MIME_GSHEET,
  MIME_GSLIDES,
  MIME_GDRAW,
};
