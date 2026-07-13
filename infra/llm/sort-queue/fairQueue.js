/**
 * Round-robin tenant selection for fair multi-user scheduling.
 */

/**
 * @typedef {{ tenantId: string; queueKey: string }} TenantQueue
 */

/**
 * Pick the next tenant queue key that still has pending jobs.
 * @param {import('redis').RedisClientType} redis
 * @param {string} rotationKey
 * @param {string} tenantPrefix
 * @returns {Promise<TenantQueue | null>}
 */
async function pickNextTenantQueue(redis, rotationKey, tenantPrefix) {
  const attempts = await redis.lLen(rotationKey);
  if (attempts <= 0) {
    return null;
  }
  for (let i = 0; i < attempts; i += 1) {
    const tenantId = await redis.lPop(rotationKey);
    if (!tenantId) {
      return null;
    }
    const queueKey = `${tenantPrefix}${tenantId}`;
    const depth = await redis.lLen(queueKey);
    if (depth > 0) {
      await redis.rPush(rotationKey, tenantId);
      return { tenantId, queueKey };
    }
  }
  return null;
}

/**
 * Register tenant in fair rotation when a new job arrives.
 * @param {import('redis').RedisClientType} redis
 * @param {string} rotationKey
 * @param {string} tenantId
 */
async function registerTenant(redis, rotationKey, tenantId) {
  const markerKey = `${rotationKey}:seen:${tenantId}`;
  const inserted = await redis.set(markerKey, "1", { NX: true, EX: 3600 });
  if (inserted) {
    await redis.rPush(rotationKey, tenantId);
  }
}

/**
 * Derive a stable tenant id from the bearer token (no secrets stored).
 * @param {string} authorization
 */
function tenantIdFromAuthorization(authorization) {
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return "anonymous";
  }
  return token.slice(-12);
}

module.exports = {
  pickNextTenantQueue,
  registerTenant,
  tenantIdFromAuthorization,
};
