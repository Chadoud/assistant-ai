/**
 * Redis job store for sort inference queue.
 */

const { randomUUID } = require("crypto");
const { registerTenant, tenantIdFromAuthorization } = require("./fairQueue");

const QUEUE_PREFIX = "sort:tenant:";
const ROTATION_KEY = "sort:fair:rotation";
const RESULT_PREFIX = "sort:result:";
const PENDING_COUNTER_KEY = "sort:stats:pending";

/**
 * @param {import('redis').RedisClientType} redis
 */
async function readPendingCount(redis) {
  const raw = await redis.get(PENDING_COUNTER_KEY);
  const n = Number.parseInt(String(raw || "0"), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {import('redis').RedisClientType} redis
 * @param {{ method: string; path: string; body: object; authorization: string }} jobInput
 */
async function enqueueJob(redis, jobInput) {
  const jobId = randomUUID();
  const tenantId = tenantIdFromAuthorization(jobInput.authorization);
  const queueKey = `${QUEUE_PREFIX}${tenantId}`;
  const payload = JSON.stringify({
    id: jobId,
    tenantId,
    method: jobInput.method,
    path: jobInput.path,
    body: jobInput.body,
    authorization: jobInput.authorization,
    enqueuedAt: Date.now(),
  });
  await redis.rPush(queueKey, payload);
  await redis.incr(PENDING_COUNTER_KEY);
  await registerTenant(redis, ROTATION_KEY, tenantId);
  return jobId;
}

/**
 * @param {import('redis').RedisClientType} redis
 */
async function dequeueJobPayload(redis, queueKey) {
  const popped = await redis.lPop(queueKey);
  if (popped) {
    await redis.decr(PENDING_COUNTER_KEY);
  }
  return popped;
}

/**
 * @param {import('redis').RedisClientType} redis
 * @param {string} jobId
 * @param {number} ttlSeconds
 * @param {{ status: string; statusCode?: number; data?: unknown; error?: string }} result
 */
async function storeResult(redis, jobId, ttlSeconds, result) {
  await redis.set(`${RESULT_PREFIX}${jobId}`, JSON.stringify(result), { EX: ttlSeconds });
}

/**
 * @param {import('redis').RedisClientType} redis
 * @param {string} jobId
 */
async function readResult(redis, jobId) {
  const raw = await redis.get(`${RESULT_PREFIX}${jobId}`);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  ROTATION_KEY,
  QUEUE_PREFIX,
  PENDING_COUNTER_KEY,
  enqueueJob,
  dequeueJobPayload,
  readPendingCount,
  storeResult,
  readResult,
};
