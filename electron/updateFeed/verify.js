const { loadEd25519 } = require("../crypto/ed25519");
const { canonicalUpdateFeedPayload } = require("./canonical");
const { EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX } = require("./embeddedPublicKey");

/**
 * Verify Ed25519 signature on a latest.json feed object.
 * @param {object} feed
 * @param {{ publicKeyHex?: string }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function verifyUpdateFeed(feed, opts = {}) {
  if (!feed || typeof feed !== "object" || Array.isArray(feed)) {
    return { ok: false, reason: "payload" };
  }
  const sigRaw = feed.sig;
  if (typeof sigRaw !== "string" || !sigRaw.trim()) {
    return { ok: false, reason: "missing_sig" };
  }
  if (typeof feed.version !== "string" || !feed.version.trim()) {
    return { ok: false, reason: "version" };
  }

  let sig;
  try {
    sig = Buffer.from(sigRaw.trim(), "base64url");
  } catch {
    return { ok: false, reason: "sig_format" };
  }
  if (sig.length !== 64) {
    return { ok: false, reason: "sig_len" };
  }

  const hex =
    typeof opts.publicKeyHex === "string" && opts.publicKeyHex.trim()
      ? opts.publicKeyHex.trim()
      : EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX;
  let pub;
  try {
    pub = Uint8Array.from(Buffer.from(hex, "hex"));
  } catch {
    return { ok: false, reason: "pubkey" };
  }
  if (pub.length !== 32) {
    return { ok: false, reason: "pubkey_len" };
  }

  let message;
  try {
    message = new TextEncoder().encode(canonicalUpdateFeedPayload(feed));
  } catch {
    return { ok: false, reason: "canonical" };
  }

  const loaded = await loadEd25519();
  if (!loaded.ok) {
    // Packaged builds must include @noble/ed25519 in app.asar (see updater-packaging.cjs).
    return { ok: false, reason: loaded.reason || "crypto_unavailable" };
  }
  const ok = await loaded.ed.verifyAsync(Uint8Array.from(sig), message, pub);
  if (!ok) {
    return { ok: false, reason: "sig_verify" };
  }
  return { ok: true };
}

module.exports = { verifyUpdateFeed };
