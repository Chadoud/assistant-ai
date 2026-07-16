/**
 * Pure helpers for the in-app updater (unit-testable, no Electron).
 */

const BACKOFF_STEPS_MS = [
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
  6 * 60 * 60 * 1000,
];

/**
 * @param {number} failCount consecutive failures (0 = first failure → first step)
 * @returns {number}
 */
function nextBackoffMs(failCount) {
  const idx = Math.max(0, Math.min(BACKOFF_STEPS_MS.length - 1, Math.floor(failCount)));
  return BACKOFF_STEPS_MS[idx];
}

/**
 * @param {number} baseMs
 * @param {number} [jitterFraction=0.1]
 * @param {() => number} [rng=Math.random]
 */
function withJitter(baseMs, jitterFraction = 0.1, rng = Math.random) {
  const base = Math.max(0, Number(baseMs) || 0);
  const frac = Math.max(0, Math.min(0.5, Number(jitterFraction) || 0));
  const delta = base * frac * (2 * rng() - 1);
  return Math.max(1000, Math.round(base + delta));
}

/**
 * @param {string} current
 * @param {string} remote
 * @param {(a: string, b: string) => number} compareVersions
 */
function shouldOfferUpdate(current, remote, compareVersions) {
  const cur = (current || "").trim();
  const rem = (remote || "").trim();
  if (!rem) return false;
  return compareVersions(rem, cur) > 0;
}

/**
 * @param {object} feed
 * @param {string} currentVersion
 * @param {(a: string, b: string) => number} compareVersions
 * @param {() => boolean} canSelfUpdate
 * @param {(feed: object) => string} downloadUrlFor
 */
function applyFeedToState(feed, currentVersion, compareVersions, canSelfUpdate, downloadUrlFor) {
  const remoteVersion = feed && typeof feed.version === "string" ? feed.version.trim() : "";
  if (!remoteVersion) {
    return { status: "idle", version: null, notes: null, canSelfUpdate: false, downloadUrl: null };
  }
  if (!shouldOfferUpdate(currentVersion, remoteVersion, compareVersions)) {
    return {
      status: "up-to-date",
      version: remoteVersion,
      notes: null,
      canSelfUpdate: false,
      downloadUrl: null,
      progress: null,
      error: null,
    };
  }
  return {
    status: "available",
    version: remoteVersion,
    notes: typeof feed.notes === "string" ? feed.notes : null,
    canSelfUpdate: Boolean(canSelfUpdate()),
    downloadUrl: downloadUrlFor(feed),
    progress: null,
    error: null,
  };
}

module.exports = {
  BACKOFF_STEPS_MS,
  nextBackoffMs,
  withJitter,
  shouldOfferUpdate,
  applyFeedToState,
};
