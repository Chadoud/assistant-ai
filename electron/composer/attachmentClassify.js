/**
 * Composer attachment kind classification (shared by dialogHandlers).
 */

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
]);

const HEIC_EXT = new Set([".heic", ".heif"]);

const TEXT_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".log",
  ".tsv",
]);

const DOCUMENT_EXT = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".rtf",
  ".html",
  ".htm",
  // text-like also accepted by backend document extract
  ...TEXT_EXT,
]);

const VIDEO_EXT = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".webm",
  ".wmv",
  ".flv",
]);

/**
 * @param {string} ext lower-case extension including dot
 * @returns {"image" | "heic" | "text" | "document" | "video" | "binary"}
 */
function classifyAttachmentExt(ext) {
  const e = String(ext || "").toLowerCase();
  if (HEIC_EXT.has(e)) return "heic";
  if (IMAGE_EXT.has(e)) return "image";
  if (VIDEO_EXT.has(e)) return "video";
  if (TEXT_EXT.has(e)) return "text";
  if (DOCUMENT_EXT.has(e)) return "document";
  return "binary";
}

function mimeForImageExt(ext) {
  const e = String(ext || "").toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".bmp") return "image/bmp";
  if (e === ".avif") return "image/avif";
  return "image/jpeg";
}

module.exports = {
  IMAGE_EXT,
  HEIC_EXT,
  TEXT_EXT,
  DOCUMENT_EXT,
  VIDEO_EXT,
  classifyAttachmentExt,
  mimeForImageExt,
};
