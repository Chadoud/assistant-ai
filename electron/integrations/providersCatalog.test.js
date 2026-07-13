const { test } = require("node:test");
const assert = require("node:assert");
const { PROVIDER_DEFINITIONS } = require("./providersCatalog");

const EXPECTED_IDS = [
  "google-gmail",
  "google-drive",
  "google-calendar",
  "dropbox",
  "microsoft",
  "onedrive",
  "outlook",
  "notion",
  "s3",
  "slack",
  "whatsapp",
  "icloud",
  "infomaniak",
  "infomaniak-calendar",
];

test("provider catalog lists all providers in canonical order", () => {
  const ids = PROVIDER_DEFINITIONS.map((p) => p.id);
  assert.deepStrictEqual(ids, EXPECTED_IDS);
});

test("every provider has capabilityLabels and scopesSummary", () => {
  for (const p of PROVIDER_DEFINITIONS) {
    assert.ok(
      Array.isArray(p.capabilityLabels) && p.capabilityLabels.length > 0,
      `${p.id}: missing capabilityLabels`,
    );
    assert.ok(
      typeof p.scopesSummary === "string" && p.scopesSummary.length > 0,
      `${p.id}: missing scopesSummary`,
    );
  }
});

test("credential-based providers have credentialsBased flag; OAuth providers have clientIdEnvVar or localOnly", () => {
  for (const p of PROVIDER_DEFINITIONS) {
    if (p.credentialsBased) {
      assert.strictEqual(p.clientIdEnvVar, null, `${p.id}: credentialsBased but clientIdEnvVar set`);
    } else if (p.localOnly) {
      assert.strictEqual(p.clientIdEnvVar, null, `${p.id}: localOnly but clientIdEnvVar set`);
    } else if (!p.internal) {
      assert.ok(
        typeof p.clientIdEnvVar === "string" && p.clientIdEnvVar.length > 0,
        `${p.id}: OAuth provider missing clientIdEnvVar`,
      );
    }
  }
});

test("dashboard URL is set for non-local providers", () => {
  for (const p of PROVIDER_DEFINITIONS) {
    if (p.localOnly) continue;
    assert.ok(
      typeof p.dashboardUrl === "string" && p.dashboardUrl.startsWith("https://"),
      `${p.id}: missing dashboardUrl`,
    );
  }
});
