/**
 * Redis-backed fair inference queue for cloud sort workloads.
 */
const express = require("express");
const { createClient } = require("redis");
const { pickNextTenantQueue } = require("./fairQueue");
const {
  ROTATION_KEY,
  QUEUE_PREFIX,
  enqueueJob,
  dequeueJobPayload,
  readPendingCount,
  storeResult,
  readResult,
} = require("./queueStore");
const { forwardToLiteLlm } = require("./litellmForward");
const {
  recordCompleted,
  recordFailed,
  recordQueueTimeout,
  recordEnqueueError,
  snapshot,
  renderPrometheus,
} = require("./queueMetrics");

const PORT = Number.parseInt(process.env.PORT || "4011", 10);
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const LITELLM_INTERNAL_URL = (process.env.LITELLM_INTERNAL_URL || "http://litellm:4000").replace(/\/$/, "");
const WORKER_COUNT = Math.max(1, Number.parseInt(process.env.SORT_QUEUE_WORKERS || "4", 10));
const WAIT_MS = Math.max(5_000, Number.parseInt(process.env.SORT_QUEUE_WAIT_MS || "180000", 10));
const RESULT_TTL_SECONDS = Math.max(60, Number.parseInt(process.env.SORT_QUEUE_RESULT_TTL_SECONDS || "600", 10));
const POLL_MS = Number.parseInt(process.env.SORT_QUEUE_POLL_MS || "120", 10);
const PENDING_ALERT_THRESHOLD = Number.parseInt(process.env.SORT_QUEUE_PENDING_ALERT_THRESHOLD || "32", 10);

const app = express();
app.use(express.json({ limit: "12mb" }));

/** @type {import('redis').RedisClientType | null} */
let redis = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('redis').RedisClientType} client
 */
async function runWorker(client, workerId) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tenant = await pickNextTenantQueue(client, ROTATION_KEY, QUEUE_PREFIX);
    if (!tenant) {
      await sleep(150);
      continue;
    }
    const popped = await dequeueJobPayload(client, tenant.queueKey);
    if (!popped) {
      continue;
    }
    let job;
    try {
      job = JSON.parse(popped);
    } catch {
      continue;
    }
    const started = Date.now();
    try {
      const forwarded = await forwardToLiteLlm(job, LITELLM_INTERNAL_URL);
      const ok = forwarded.statusCode < 400;
      await storeResult(client, job.id, RESULT_TTL_SECONDS, {
        status: ok ? "ok" : "error",
        statusCode: forwarded.statusCode,
        data: forwarded.data,
        latency_ms: Date.now() - started,
      });
      if (ok) {
        recordCompleted();
      } else {
        recordFailed();
        console.warn(
          `[sort-queue worker ${workerId}] job ${job.id} HTTP ${forwarded.statusCode} tenant ${job.tenantId}`,
        );
      }
    } catch (err) {
      recordFailed();
      const message = err instanceof Error ? err.message : String(err);
      await storeResult(client, job.id, RESULT_TTL_SECONDS, {
        status: "error",
        statusCode: 502,
        error: message,
        latency_ms: Date.now() - started,
      });
      console.warn(`[sort-queue worker ${workerId}] job ${job.id} failed: ${message}`);
    }
  }
}

async function buildHealthPayload() {
  const stats = snapshot();
  let pendingJobs = 0;
  let redisOk = false;
  if (redis) {
    try {
      pendingJobs = await readPendingCount(redis);
      redisOk = true;
    } catch {
      redisOk = false;
    }
  }
  const overloaded = pendingJobs >= PENDING_ALERT_THRESHOLD;
  return {
    ok: redisOk,
    service: "exo-sort-inference-queue",
    workers: WORKER_COUNT,
    redis_ok: redisOk,
    pending_jobs: pendingJobs,
    pending_alert_threshold: PENDING_ALERT_THRESHOLD,
    overloaded,
    ...stats,
  };
}

app.get("/health", async (_req, res) => {
  const payload = await buildHealthPayload();
  res.status(payload.ok ? 200 : 503).json(payload);
});

app.get("/metrics", async (_req, res) => {
  const stats = snapshot();
  let pendingJobs = 0;
  if (redis) {
    try {
      pendingJobs = await readPendingCount(redis);
    } catch {
      pendingJobs = 0;
    }
  }
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheus({ ...stats, pendingJobs }, WORKER_COUNT));
});

app.post("/v1/sort/inference", async (req, res) => {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ detail: "missing_token" });
  }
  const method = String(req.body?.method || "POST").toUpperCase();
  const path = String(req.body?.path || "").trim();
  if (!path.startsWith("/v1/")) {
    return res.status(400).json({ detail: "invalid_path" });
  }
  if (!redis) {
    return res.status(503).json({ detail: "queue_unavailable" });
  }

  let jobId;
  try {
    jobId = await enqueueJob(redis, {
      method,
      path,
      body: req.body?.body && typeof req.body.body === "object" ? req.body.body : {},
      authorization,
    });
  } catch (err) {
    recordEnqueueError();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sort/inference] enqueue failed:", message);
    return res.status(503).json({ detail: "enqueue_failed" });
  }

  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const result = await readResult(redis, jobId);
    if (result) {
      if (result.status === "ok") {
        return res.status(result.statusCode || 200).json(result.data);
      }
      const code = result.statusCode && result.statusCode >= 400 ? result.statusCode : 502;
      return res.status(code).json(result.data || { detail: result.error || "inference_failed" });
    }
    await sleep(POLL_MS);
  }

  recordQueueTimeout();
  return res.status(504).json({ detail: "queue_timeout", job_id: jobId });
});

async function main() {
  redis = createClient({ url: REDIS_URL });
  redis.on("error", (err) => {
    console.error("[sort-queue] redis error:", err instanceof Error ? err.message : err);
  });
  await redis.connect();

  for (let i = 0; i < WORKER_COUNT; i += 1) {
    void runWorker(redis, i + 1);
  }

  app.listen(PORT, () => {
    console.log(`[exo-sort-inference-queue] listening on ${PORT} workers=${WORKER_COUNT}`);
  });
}

main().catch((err) => {
  console.error("[exo-sort-inference-queue] fatal:", err);
  process.exit(1);
});
