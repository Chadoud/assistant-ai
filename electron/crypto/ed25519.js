/**
 * Shared Ed25519 loader for update-feed and license verification.
 * Missing @noble/ed25519 (packaging gap) must never throw into the main process.
 */

/**
 * @returns {Promise<
 *   | { ok: true, ed: typeof import("@noble/ed25519") }
 *   | { ok: false, reason: "crypto_unavailable", message?: string }
 * >}
 */
async function loadEd25519() {
  try {
    const ed = await import("@noble/ed25519");
    return { ok: true, ed };
  } catch (err) {
    return {
      ok: false,
      reason: "crypto_unavailable",
      message: err && err.message ? String(err.message) : "import_failed",
    };
  }
}

module.exports = { loadEd25519 };
