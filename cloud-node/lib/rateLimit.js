/** Minimal fixed-window in-memory rate limiter (single-process shared hosting). */

const buckets = new Map();

/**
 * @param {string} key caller identity (e.g. ip)
 * @param {number} maxEvents allowed events per window
 * @param {number} windowMs window size in milliseconds
 * @returns {boolean} true when the event is allowed
 */
function allow(key, maxEvents, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  if (bucket.count >= maxEvents) {
    return false;
  }
  bucket.count += 1;
  return true;
}

module.exports = { allow };
