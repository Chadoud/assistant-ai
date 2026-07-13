const fs = require("fs");
const path = require("path");
const { FREE_TRIAL_DAYS } = require("./constants");

function trialPath(userData) {
  return path.join(userData, "trial.json");
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function parseIso(value) {
  if (!value || typeof value !== "string") return null;
  let text = value.trim();
  if (!text.includes("T") && text.includes(" ")) {
    text = `${text.replace(" ", "T")}Z`;
  } else if (!text.endsWith("Z") && !text.includes("+")) {
    text = `${text}Z`;
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function formatIso(ms) {
  return new Date(ms).toISOString();
}

function writeTrialRecord(userData, record) {
  const p = trialPath(userData);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ v: 1, ...record, updated_at: Date.now() / 1000 }, null, 2), "utf8");
}

/**
 * Idempotently start a local trial on first use.
 * @param {string} userData
 */
function ensureLocalTrialStarted(userData) {
  const existing = readJsonSafe(trialPath(userData), null);
  if (existing && parseIso(existing.trialEndsAt)) {
    return existing;
  }
  const startedMs = Date.now();
  const endsMs = startedMs + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const record = {
    trialStartedAt: formatIso(startedMs),
    trialEndsAt: formatIso(endsMs),
    source: "local_first_launch",
  };
  writeTrialRecord(userData, record);
  return record;
}

/**
 * Merge cloud account trial end into local trial.json.
 * @param {string} userData
 * @param {string | null | undefined} trialEndsAt ISO timestamp from cloud /v1/me
 */
function syncCloudTrialEndsAt(userData, trialEndsAt) {
  const cloudEndMs = parseIso(trialEndsAt);
  if (cloudEndMs == null) return readJsonSafe(trialPath(userData), null);

  const existing = readJsonSafe(trialPath(userData), null);
  const localEndMs = existing ? parseIso(existing.trialEndsAt) : null;
  const chosenEndMs = localEndMs == null || cloudEndMs > localEndMs ? cloudEndMs : localEndMs;
  let startedMs = existing ? parseIso(existing.trialStartedAt) : null;
  if (startedMs == null) {
    startedMs = chosenEndMs - FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;
  }
  const record = {
    trialStartedAt: formatIso(startedMs),
    trialEndsAt: formatIso(chosenEndMs),
    source: "cloud_account",
  };
  writeTrialRecord(userData, record);
  return record;
}

/**
 * @param {string} userData
 */
function getTrialStatus(userData) {
  let record = readJsonSafe(trialPath(userData), null);
  if (!record || !parseIso(record.trialEndsAt)) {
    record = ensureLocalTrialStarted(userData);
  }
  const endsMs = parseIso(record.trialEndsAt);
  const startedMs = parseIso(record.trialStartedAt);
  const now = Date.now();
  const active = endsMs != null && now < endsMs;
  const remaining =
    endsMs == null ? 0 : Math.max(0, Math.ceil((endsMs - now) / (24 * 60 * 60 * 1000)));
  return {
    trialActive: active,
    trialStartedAt: startedMs != null ? formatIso(startedMs) : null,
    trialEndsAt: endsMs != null ? formatIso(endsMs) : null,
    trialDaysRemaining: remaining,
    trialExpired: endsMs != null && !active,
  };
}

/**
 * @param {string} userData
 */
function isTrialActive(userData) {
  return getTrialStatus(userData).trialActive;
}

module.exports = {
  trialPath,
  ensureLocalTrialStarted,
  syncCloudTrialEndsAt,
  getTrialStatus,
  isTrialActive,
};
