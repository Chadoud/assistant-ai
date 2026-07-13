/**
 * Shared PKCE helpers used by all OAuth integrations.
 *
 * Single implementation — previously copy-pasted across
 * google.js, microsoft.js, dropbox.js, and infomaniak.js.
 */

const crypto = require("crypto");

/**
 * URL-safe base64 encoding with no padding, as required by PKCE.
 * @param {Buffer} buf
 * @returns {string}
 */
function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a PKCE verifier + S256 challenge pair.
 * @returns {{ verifier: string; challenge: string }}
 */
function generatePkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Generate a random state cookie for CSRF protection.
 * @returns {string}
 */
function generateState() {
  return b64url(crypto.randomBytes(16));
}

module.exports = { b64url, generatePkcePair, generateState };
