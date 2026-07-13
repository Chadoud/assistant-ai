/**
 * Parse Meta OAuth redirect URLs during WhatsApp Embedded Signup.
 * @param {string} url
 * @param {string} redirectUri Expected api.exosites.ch callback (from connect-config).
 * @returns {{ code: string; codeSource: "oauth_callback"|"embedded_finish"; oauthRedirectUri: string } | null}
 */
function tryExtractMetaOAuthCode(url, redirectUri) {
  try {
    const parsed = new URL(String(url).split("#")[0]);
    const code = parsed.searchParams.get("code");
    if (typeof code !== "string" || !code.trim()) return null;

    const expected = new URL(redirectUri);
    const statedRedirect = parsed.searchParams.get("redirect_uri")?.trim() || "";

    if (parsed.origin === expected.origin && parsed.pathname === expected.pathname) {
      return {
        code: code.trim(),
        codeSource: "oauth_callback",
        oauthRedirectUri: redirectUri,
      };
    }

    if (
      parsed.hostname.includes("facebook.com") &&
      parsed.pathname.includes("/hosted_es/oauth_callback")
    ) {
      if (statedRedirect) {
        const redirect = new URL(statedRedirect);
        if (redirect.origin !== expected.origin || redirect.pathname !== expected.pathname) {
          return null;
        }
      }
      // Browser OAuth redirect (incl. re-auth "Continue as …") — must exchange with the same
      // redirect_uri passed to the onboard URL, even when Meta omits it on hosted_es.
      return {
        code: code.trim(),
        codeSource: "oauth_callback",
        oauthRedirectUri: statedRedirect || redirectUri,
      };
    }

    return null;
  } catch {
    return null;
  }
}

module.exports = { tryExtractMetaOAuthCode };
