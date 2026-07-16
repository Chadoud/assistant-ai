const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  BACKOFF_STEPS_MS,
  nextBackoffMs,
  withJitter,
  shouldOfferUpdate,
  applyFeedToState,
} = require("./helpers");

test("nextBackoffMs follows 15m → 30m → 1h → 3h → 6h cap", () => {
  assert.equal(nextBackoffMs(0), BACKOFF_STEPS_MS[0]);
  assert.equal(nextBackoffMs(1), BACKOFF_STEPS_MS[1]);
  assert.equal(nextBackoffMs(2), BACKOFF_STEPS_MS[2]);
  assert.equal(nextBackoffMs(3), BACKOFF_STEPS_MS[3]);
  assert.equal(nextBackoffMs(4), BACKOFF_STEPS_MS[4]);
  assert.equal(nextBackoffMs(99), BACKOFF_STEPS_MS[4]);
});

test("withJitter stays within ±10% and at least 1s", () => {
  const base = 100_000;
  for (let i = 0; i < 20; i++) {
    const v = withJitter(base, 0.1, () => i / 20);
    assert.ok(v >= 1000);
    assert.ok(v >= Math.round(base * 0.9) - 1);
    assert.ok(v <= Math.round(base * 1.1) + 1);
  }
});

test("shouldOfferUpdate uses compareVersions", () => {
  const cmp = (a, b) => (a === b ? 0 : a > b ? 1 : -1);
  assert.equal(shouldOfferUpdate("1.0.0", "1.0.1", cmp), true);
  assert.equal(shouldOfferUpdate("1.0.1", "1.0.0", cmp), false);
  assert.equal(shouldOfferUpdate("1.0.0", "", cmp), false);
});

test("applyFeedToState maps idle / up-to-date / available", () => {
  const cmp = (a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  };
  assert.equal(applyFeedToState({}, "1.0.0", cmp, () => false, () => "u").status, "idle");
  assert.equal(
    applyFeedToState({ version: "1.0.0" }, "1.0.0", cmp, () => false, () => "u").status,
    "up-to-date"
  );
  const avail = applyFeedToState(
    { version: "2.0.0", notes: "n" },
    "1.0.0",
    cmp,
    () => true,
    () => "https://dl"
  );
  assert.equal(avail.status, "available");
  assert.equal(avail.canSelfUpdate, true);
  assert.equal(avail.downloadUrl, "https://dl");
});
