/**
 * Generic key-value secret storage in the main process (P5-5.2.2).
 * Values are encrypted with Electron safeStorage when the OS supports it.
 */

const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const SECRETS_DIR = "settings_secrets_v1";
const ENC_SUFFIX = ".enc";
const PLAIN_SUFFIX = ".b64";
const MAX_KEY_LENGTH = 128;

/**
 * @param {unknown} key
 * @returns {string | null}
 */
function sanitizeSecretKey(key) {
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {string} safeKey
 * @param {string} userDataRoot
 */
function secretPaths(safeKey, userDataRoot) {
  const dir = path.join(userDataRoot, SECRETS_DIR);
  const base = path.join(dir, safeKey);
  return {
    dir,
    enc: `${base}${ENC_SUFFIX}`,
    plain: `${base}${PLAIN_SUFFIX}`,
  };
}

/**
 * @param {{ userDataRoot: string; safeStorageApi: typeof safeStorage; fsApi: typeof fs }} deps
 * @param {unknown} key
 * @returns {string | null}
 */
function readSecretWithDeps(deps, key) {
  const safeKey = sanitizeSecretKey(key);
  if (!safeKey) return null;
  const { enc, plain } = secretPaths(safeKey, deps.userDataRoot);
  try {
    if (deps.safeStorageApi.isEncryptionAvailable()) {
      if (!deps.fsApi.existsSync(enc)) return null;
      return deps.safeStorageApi.decryptString(deps.fsApi.readFileSync(enc));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {{ userDataRoot: string; safeStorageApi: typeof safeStorage; fsApi: typeof fs }} deps
 * @param {unknown} key
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function writeSecretWithDeps(deps, key, value) {
  const safeKey = sanitizeSecretKey(key);
  if (!safeKey) {
    return { ok: false, reason: "invalid_key" };
  }
  const secretValue = typeof value === "string" ? value : "";
  if (!secretValue) {
    return { ok: false, reason: "empty_value" };
  }
  const { dir, enc, plain } = secretPaths(safeKey, deps.userDataRoot);
  try {
    if (!deps.safeStorageApi.isEncryptionAvailable()) {
      return { ok: false, reason: "encryption_unavailable" };
    }
    deps.fsApi.mkdirSync(dir, { recursive: true });
    deps.fsApi.writeFileSync(enc, deps.safeStorageApi.encryptString(secretValue));
    try {
      deps.fsApi.unlinkSync(plain);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function defaultDeps() {
  return {
    userDataRoot: app.getPath("userData"),
    safeStorageApi: safeStorage,
    fsApi: fs,
  };
}

/**
 * @param {unknown} key
 * @returns {string | null}
 */
function getSecret(key) {
  return readSecretWithDeps(defaultDeps(), key);
}

/**
 * @param {unknown} key
 * @returns {boolean}
 */
function hasSecret(key) {
  const v = getSecret(key);
  return typeof v === "string" && v.length > 0;
}

/**
 * @param {unknown} key
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function setSecret(key, value) {
  return writeSecretWithDeps(defaultDeps(), key, value);
}

/**
 * Remove a stored secret (encrypted blob and any legacy plain file).
 * @param {unknown} key
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function clearSecret(key) {
  const safeKey = sanitizeSecretKey(key);
  if (!safeKey) {
    return { ok: false, reason: "invalid_key" };
  }
  const { enc, plain } = secretPaths(safeKey, defaultDeps().userDataRoot);
  try {
    for (const p of [enc, plain]) {
      try {
        if (defaultDeps().fsApi.existsSync(p)) defaultDeps().fsApi.unlinkSync(p);
      } catch {
        /* ignore per-file */
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

module.exports = {
  sanitizeSecretKey,
  secretPaths,
  readSecretWithDeps,
  writeSecretWithDeps,
  getSecret,
  setSecret,
  hasSecret,
  clearSecret,
};
