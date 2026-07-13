const express = require("express");
const config = require("../lib/config");

const router = express.Router();

/** Public HTTPS redirect URI for Meta WhatsApp Embedded Signup (desktop + web). */
function embeddedSignupRedirectUri() {
  return `${config.appBaseUrl}/v1/oauth/whatsapp-embedded-signup/callback`;
}

/**
 * Meta redirects here after Embedded Signup when a redirect_uri is used.
 * Electron's signup window also lands here; the preload + main process read ?code=.
 */
router.get("/oauth/whatsapp-embedded-signup/callback", (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const error = typeof req.query.error === "string" ? req.query.error.trim() : "";
  const errorDescription =
    typeof req.query.error_description === "string" ? req.query.error_description.trim() : "";

  res.set("Content-Type", "text/html; charset=utf-8");
  if (error) {
    res.status(400).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Meta connect failed</title></head>
<body style="font-family:sans-serif;padding:24px;max-width:32rem;margin:auto">
  <h1>Meta connect failed</h1>
  <p>${escapeHtml(errorDescription || error)}</p>
  <p>You can close this window and try again in Exo.</p>
</body></html>`);
    return;
  }

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>WhatsApp connected</title></head>
<body style="font-family:sans-serif;padding:24px;max-width:32rem;margin:auto">
  <h1>${code ? "Almost done" : "Missing authorization code"}</h1>
  <p>${code ? "Finishing WhatsApp setup in Exo…" : "Meta did not return a code. Close this window and try Connect with Meta again."}</p>
  <script>
    (function () {
      var code = ${JSON.stringify(code)};
      if (!code) return;
      if (window.whatsappSignupApi) {
        window.whatsappSignupApi.complete({ code: code, status: "connected", codeSource: "oauth_callback" });
      }
    })();
  </script>
</body></html>`);
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { router, embeddedSignupRedirectUri };
