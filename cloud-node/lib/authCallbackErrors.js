/**
 * Maps OAuth callback failures to stable error codes for the desktop handoff page.
 * Logs retain full detail; users only see mapped codes.
 */

/**
 * @param {unknown} err
 * @returns {string}
 */
function mapSocialCallbackError(err) {
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "");

  if (/auth_identities|auth_exchange_codes|refresh_token_jti|password_hash|cannot be null|doesn't exist|Unknown column|ER_NO_SUCH_TABLE|ER_DUP_ENTRY/i.test(msg)) {
    if (/ER_DUP_ENTRY|duplicate/i.test(msg)) {
      return "signin_failed";
    }
    return "server_setup";
  }
  if (/nonce mismatch|invalid_state/i.test(msg)) {
    return "invalid_state";
  }
  if (/token exchange failed|invalid_grant|redirect_uri_mismatch/i.test(msg)) {
    return "signin_failed";
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg)) {
    return "offline";
  }
  return "signin_failed";
}

module.exports = { mapSocialCallbackError };
