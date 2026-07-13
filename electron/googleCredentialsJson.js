/** Read Google OAuth client id + secret from Desktop/Web credentials JSON. */

const fs = require("fs");

/**
 * @param {string} jsonPath
 * @returns {{ clientId: string; clientSecret: string }}
 */
function googleCredentialsFromJsonPath(jsonPath) {
  const empty = { clientId: "", clientSecret: "" };
  const p = (jsonPath || "").trim();
  if (!p || !fs.existsSync(p)) return empty;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    const block = data && (data.installed || data.web);
    if (!block || typeof block !== "object") return empty;
    const clientId = typeof block.client_id === "string" ? block.client_id.trim() : "";
    const clientSecret = typeof block.client_secret === "string" ? block.client_secret.trim() : "";
    return { clientId, clientSecret };
  } catch {
    return empty;
  }
}

module.exports = { googleCredentialsFromJsonPath };
