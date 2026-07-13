const { LICENSE_PREFIX, PRODUCT_SLUG } = require("./constants");
const { getMachineFingerprint } = require("./machineId");
const { EMBEDDED_LICENSE_PUBLIC_KEY_HEX } = require("./embeddedPublicKey");

/** Same canonical form as backend `canonical_license_payload`. */
function canonicalLicensePayload(obj) {
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

/**
 * @param {string} licenseKey
 * @returns {Promise<{ ok: boolean, reason?: string, payload?: object }>}
 */
async function verifyLicenseKey(licenseKey) {
  const trimmed = typeof licenseKey === "string" ? licenseKey.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return { ok: false, reason: "format" };
  }
  let payloadObj;
  try {
    const raw = Buffer.from(parts[1], "base64url").toString("utf8");
    payloadObj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (payloadObj.product !== PRODUCT_SLUG) {
    return { ok: false, reason: "product" };
  }
  if (payloadObj.tier !== "full") {
    return { ok: false, reason: "tier" };
  }
  const fp = getMachineFingerprint();
  if (typeof payloadObj.machine_id !== "string" || payloadObj.machine_id !== fp) {
    return { ok: false, reason: "machine" };
  }
  const message = new TextEncoder().encode(canonicalLicensePayload(payloadObj));
  let sig;
  try {
    sig = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "sig_format" };
  }
  if (sig.length !== 64) {
    return { ok: false, reason: "sig_len" };
  }
  const pub = Uint8Array.from(Buffer.from(EMBEDDED_LICENSE_PUBLIC_KEY_HEX, "hex"));
  const ed = await import("@noble/ed25519");
  const ok = await ed.verifyAsync(Uint8Array.from(sig), message, pub);
  if (!ok) {
    return { ok: false, reason: "sig_verify" };
  }
  return { ok: true, payload: payloadObj };
}

module.exports = { verifyLicenseKey, canonicalLicensePayload };
