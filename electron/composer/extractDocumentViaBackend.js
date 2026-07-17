/**
 * Extract document text via local backend for composer attach.
 */

const { backendFetch } = require("../backendHttp");

/**
 * @param {string} filePath absolute path already validated by isSafeUserContentPath
 * @returns {Promise<
 *   | { ok: true; kind: "document"; basename: string; text: string; truncated?: boolean; pages?: number | null; source?: string }
 *   | { ok: true; kind: "file_too_large"; basename: string }
 *   | { ok: true; kind: "video"; basename: string }
 *   | { ok: true; kind: "binary"; basename: string; reason?: string }
 *   | { ok: false; reason: string }
 * >}
 */
async function extractDocumentViaBackend(filePath) {
  const basename = require("path").basename(filePath);
  let res;
  try {
    res = await backendFetch("/assistant/extract-attachment", {
      method: "POST",
      body: { path: filePath },
    });
  } catch (err) {
    return {
      ok: false,
      reason: `Backend unavailable for document extract (${String(err?.message ?? err)})`,
    };
  }

  const data = res.data && typeof res.data === "object" ? res.data : null;
  if (!res.ok || !data) {
    return {
      ok: false,
      reason: `Document extract failed (HTTP ${res.status})`,
    };
  }

  if (data.ok === true && typeof data.text === "string") {
    return {
      ok: true,
      kind: "document",
      basename: typeof data.basename === "string" ? data.basename : basename,
      text: data.text,
      truncated: Boolean(data.truncated),
      pages: typeof data.pages === "number" ? data.pages : null,
      source: typeof data.source === "string" ? data.source : undefined,
      previewDataUrl:
        typeof data.previewDataUrl === "string" && data.previewDataUrl.startsWith("data:")
          ? data.previewDataUrl
          : undefined,
    };
  }

  const err = typeof data.error === "string" ? data.error : "extract_failed";
  if (err === "file_too_large") {
    return { ok: true, kind: "file_too_large", basename };
  }
  if (err === "video_not_supported") {
    return { ok: true, kind: "video", basename };
  }
  if (err === "no_text_layer") {
    return {
      ok: true,
      kind: "binary",
      basename,
      reason: "no_text_layer",
    };
  }
  if (err === "encrypted_or_password_protected") {
    return {
      ok: true,
      kind: "binary",
      basename,
      reason: "encrypted",
    };
  }
  if (err === "unsupported_type") {
    return { ok: true, kind: "binary", basename, reason: "unsupported_type" };
  }
  return {
    ok: true,
    kind: "binary",
    basename,
    reason: err,
  };
}

module.exports = { extractDocumentViaBackend };
