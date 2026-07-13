/**
 * Encrypted at-rest storage for third-party integration tokens (separate from cloudAuth).
 * Uses Electron safeStorage — fail-closed when OS encryption is unavailable (PR-4.4).
 */

const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");

const FILE = "integration_accounts_v1.json";

function accountsPath(userData) {
  return path.join(userData, FILE);
}

function readRawWithDeps(deps, userData) {
  const p = accountsPath(userData);
  if (!deps.fsApi.existsSync(p)) return { v: 1 };
  try {
    return JSON.parse(deps.fsApi.readFileSync(p, "utf8"));
  } catch {
    return { v: 1 };
  }
}

function writeRawWithDeps(deps, userData, obj) {
  const p = accountsPath(userData);
  deps.fsApi.mkdirSync(path.dirname(p), { recursive: true });
  deps.fsApi.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function defaultDeps() {
  return { safeStorageApi: safeStorage, fsApi: fs };
}

/**
 * @param {{ safeStorageApi: typeof safeStorage; fsApi: typeof fs }} deps
 * @param {string} userData
 * @param {string} providerId
 * @param {Record<string, unknown>} secrets — tokens only; never log.
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function saveProviderSecretsWithDeps(deps, userData, providerId, secrets) {
  if (!deps.safeStorageApi.isEncryptionAvailable()) {
    return { ok: false, reason: "encryption_unavailable" };
  }
  const raw = JSON.stringify(secrets);
  try {
    const buf = deps.safeStorageApi.encryptString(raw);
    const encRecord = { enc: buf.toString("base64"), plain: false };
    const all = readRawWithDeps(deps, userData);
    all.v = 1;
    all[providerId] = { ...encRecord, updatedAt: Date.now() };
    writeRawWithDeps(deps, userData, all);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {{ safeStorageApi: typeof safeStorage; fsApi: typeof fs }} deps
 * @param {string} userData
 * @param {string} providerId
 * @returns {Record<string, unknown> | null}
 */
function loadProviderSecretsWithDeps(deps, userData, providerId) {
  const all = readRawWithDeps(deps, userData);
  const rec = all[providerId];
  if (!rec?.enc) return null;
  const buf = Buffer.from(rec.enc, "base64");
  try {
    let json;
    if (rec.plain) {
      json = buf.toString("utf8");
    } else {
      if (!deps.safeStorageApi.isEncryptionAvailable()) return null;
      json = deps.safeStorageApi.decryptString(buf);
    }
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function clearProviderWithDeps(deps, userData, providerId) {
  const all = readRawWithDeps(deps, userData);
  delete all[providerId];
  writeRawWithDeps(deps, userData, all);
}

function saveProviderSecrets(userData, providerId, secrets) {
  return saveProviderSecretsWithDeps(defaultDeps(), userData, providerId, secrets);
}

function loadProviderSecrets(userData, providerId) {
  return loadProviderSecretsWithDeps(defaultDeps(), userData, providerId);
}

function clearProvider(userData, providerId) {
  return clearProviderWithDeps(defaultDeps(), userData, providerId);
}

module.exports = {
  saveProviderSecretsWithDeps,
  loadProviderSecretsWithDeps,
  clearProviderWithDeps,
  saveProviderSecrets,
  loadProviderSecrets,
  clearProvider,
};
