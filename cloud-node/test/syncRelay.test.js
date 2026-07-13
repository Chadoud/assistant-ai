const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyncMockPool } = require("./helpers/mockPool");

process.env.JWT_SECRET = "sync-relay-test-secret";

const ACCOUNT = "550e8400-e29b-41d4-a716-446655440000";

function loadSyncRelayWithMock(mock) {
  delete require.cache[require.resolve("../lib/syncRelay")];
  delete require.cache[require.resolve("../lib/db")];
  const db = require("../lib/db");
  db.getPool = () => mock;
  return require("../lib/syncRelay");
}

test("pushBlobs accepts envelopes and advances cursor", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const result = await syncRelay.pushBlobs(ACCOUNT, [
    {
      collection: "memory_entries",
      record_id: "mem-1",
      device_id: "dev-a",
      logical_clock: 3,
      updated_at: "2026-06-16T10:00:00Z",
      deleted: false,
      schema_version: 1,
      ciphertext: "cipher-a",
      content_hash: "hash-a",
    },
  ]);
  assert.equal(result.accepted, 1);
  assert.ok(result.cursor >= 1);
  const status = await syncRelay.syncStatus(ACCOUNT);
  assert.equal(status.blob_count, 1);
});

test("pushBlobs ignores stale logical_clock (idempotency)", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  await syncRelay.pushBlobs(ACCOUNT, [
    {
      collection: "memory_entries",
      record_id: "mem-1",
      device_id: "dev-a",
      logical_clock: 5,
      updated_at: "2026-06-16T10:00:00Z",
      deleted: false,
      schema_version: 1,
      ciphertext: "cipher-new",
      content_hash: "hash-new",
    },
  ]);
  await syncRelay.pushBlobs(ACCOUNT, [
    {
      collection: "memory_entries",
      record_id: "mem-1",
      device_id: "dev-b",
      logical_clock: 2,
      updated_at: "2026-06-16T09:00:00Z",
      deleted: false,
      schema_version: 1,
      ciphertext: "cipher-stale",
      content_hash: "hash-stale",
    },
  ]);
  const pulled = await syncRelay.pullBlobs(ACCOUNT, 0, 10);
  assert.equal(pulled.blobs.length, 1);
  assert.equal(pulled.blobs[0].ciphertext, "cipher-new");
  assert.equal(pulled.blobs[0].logical_clock, 5);
});

test("pullBlobs paginates after cursor", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  await syncRelay.pushBlobs(ACCOUNT, [
    {
      collection: "tasks",
      record_id: "t-1",
      device_id: "dev-a",
      logical_clock: 1,
      updated_at: "2026-06-16T10:00:00Z",
      ciphertext: "c1",
      content_hash: "h1",
    },
    {
      collection: "tasks",
      record_id: "t-2",
      device_id: "dev-a",
      logical_clock: 2,
      updated_at: "2026-06-16T10:01:00Z",
      ciphertext: "c2",
      content_hash: "h2",
    },
  ]);
  const page1 = await syncRelay.pullBlobs(ACCOUNT, 0, 1);
  assert.equal(page1.blobs.length, 1);
  assert.equal(page1.blobs[0].record_id, "t-1");
  assert.equal(page1.has_more, true);
  const page2 = await syncRelay.pullBlobs(ACCOUNT, page1.cursor, 10);
  assert.equal(page2.blobs.length, 1);
  assert.equal(page2.blobs[0].record_id, "t-2");
});

test("registerDevice upserts device row", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const out = await syncRelay.registerDevice(ACCOUNT, {
    name: "Desktop",
    platform: "darwin",
    pushToken: null,
    deviceId: "device-fixed-id",
  });
  assert.equal(out.device_id, "device-fixed-id");
  const status = await syncRelay.syncStatus(ACCOUNT);
  assert.equal(status.device_count, 1);
});
