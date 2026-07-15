/**
 * Canonical JSON for update-feed Ed25519 signing.
 * Sorted keys, `sig` excluded. Must match tools/update-feed-keygen/sign-latest.cjs.
 */
function canonicalUpdateFeedPayload(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("feed payload must be an object");
  }
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    if (k === "sig") continue;
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

/** Compare dotted numeric versions. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareVersions(a, b) {
  const pa = String(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

module.exports = { canonicalUpdateFeedPayload, compareVersions };
