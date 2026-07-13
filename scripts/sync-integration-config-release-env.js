#!/usr/bin/env node
/**
 * Merge OAuth client IDs from backend/.env (and process.env for CI) into
 * electron/resources/integration-config.json before packaging.
 *
 * End users never edit .env — this bakes Exosites' connector app keys into the installer.
 */
const fs = require("fs");
const path = require("path");
const { parseDotenvFile } = require("../electron/readGmailDotenvForBackend");

const ROOT = path.join(__dirname, "..");
const BACKEND_ENV = path.join(ROOT, "backend", ".env");
const INTEGRATION_JSON = path.join(ROOT, "electron", "resources", "integration-config.json");
const INTEGRATION_EXAMPLE = path.join(ROOT, "electron", "resources", "integration-config.json.example");

/** Keys bundled for packaged Electron OAuth (see electron/backendProcess.js). */
const INTEGRATION_CONFIG_KEYS = [
  "EXOSITES_CLOUD_URL",
  "EXOSITES_SORT_CREDENTIALS_URL",
  "EXOSITES_DROPBOX_APP_KEY",
  "EXOSITES_MICROSOFT_OAUTH_CLIENT_ID",
  "EXOSITES_MICROSOFT_OAUTH_REDIRECT_PORT",
  "EXOSITES_INFOMANIAK_CLIENT_ID",
  "EXOSITES_INFOMANIAK_CLIENT_SECRET",
  "EXOSITES_INFOMANIAK_OAUTH_REDIRECT_PORT",
  "EXOSITES_NOTION_CLIENT_ID",
  "EXOSITES_NOTION_CLIENT_SECRET",
  "EXOSITES_SLACK_CLIENT_ID",
  "EXOSITES_SLACK_CLIENT_SECRET",
];

const ALLOWED_KEYS = new Set(INTEGRATION_CONFIG_KEYS);

/**
 * @param {Record<string, string>} target
 * @param {Record<string, string>} source
 */
function mergeNonEmpty(target, source) {
  for (const key of INTEGRATION_CONFIG_KEYS) {
    const value = (source[key] || "").trim();
    if (value) target[key] = value;
  }
}

/** @returns {Record<string, string>} */
function readExistingIntegrationConfig() {
  const pathToRead = fs.existsSync(INTEGRATION_JSON) ? INTEGRATION_JSON : INTEGRATION_EXAMPLE;
  if (!fs.existsSync(pathToRead)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(pathToRead, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      const s = typeof v === "string" ? v.trim() : "";
      if (s && ALLOWED_KEYS.has(k)) out[k] = s;
    }
    return out;
  } catch {
    return {};
  }
}

/** @returns {Record<string, string>} */
function readProcessEnvOverrides() {
  const out = {};
  for (const key of INTEGRATION_CONFIG_KEYS) {
    const value = (process.env[key] || "").trim();
    if (value) out[key] = value;
  }
  return out;
}

function main() {
  const merged = readExistingIntegrationConfig();
  if (fs.existsSync(BACKEND_ENV)) {
    mergeNonEmpty(merged, parseDotenvFile(BACKEND_ENV, ALLOWED_KEYS));
  }
  mergeNonEmpty(merged, readProcessEnvOverrides());

  const payload = {
    _comment:
      "Bundled into packaged builds. Populated by scripts/sync-integration-config-release-env.js — public OAuth client IDs only.",
    ...Object.fromEntries(INTEGRATION_CONFIG_KEYS.filter((k) => merged[k]).map((k) => [k, merged[k]])),
  };

  fs.mkdirSync(path.dirname(INTEGRATION_JSON), { recursive: true });
  fs.writeFileSync(INTEGRATION_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const configured = INTEGRATION_CONFIG_KEYS.filter((k) => merged[k]);
  console.log("[sync-integration-config] Wrote electron/resources/integration-config.json");
  if (configured.length === 0) {
    console.log("[sync-integration-config] No connector keys found — set them in backend/.env before packaging");
  } else {
    console.log(`[sync-integration-config] Connectors configured: ${configured.join(", ")}`);
  }
}

main();
