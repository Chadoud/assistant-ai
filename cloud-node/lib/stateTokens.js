/**
 * Signed, short-lived `state` for the OAuth leg between this server and the provider.
 * Stateless (no DB): the provider echoes it back and we verify the signature + expiry.
 * Carries the OIDC `nonce` and, for PKCE, the `code_verifier`.
 */

const jwt = require("jsonwebtoken");
const config = require("./config");

const STATE_TTL_SECONDS = 10 * 60;

/**
 * @param {{ provider: string; nonce: string; codeVerifier?: string }} claims
 */
function signState(claims) {
  return jwt.sign(claims, config.authStateSecret, {
    algorithm: "HS256",
    expiresIn: STATE_TTL_SECONDS,
  });
}

/**
 * @param {string} token
 * @returns {{ provider: string; nonce: string; codeVerifier?: string } | null}
 */
function verifyState(token) {
  try {
    const payload = jwt.verify(token, config.authStateSecret, { algorithms: ["HS256"] });
    if (typeof payload !== "object" || payload === null) return null;
    if (typeof payload.provider !== "string" || typeof payload.nonce !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { signState, verifyState, STATE_TTL_SECONDS };
