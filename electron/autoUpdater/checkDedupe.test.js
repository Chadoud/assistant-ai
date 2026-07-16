/**
 * Lightweight dedupe contract: concurrent callers must share one in-flight promise.
 * Mirrors the pattern in electron/autoUpdater.js without loading Electron.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");

function makeDedupeChecker(work) {
  let checkPromise = null;
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    check() {
      if (checkPromise) return checkPromise;
      checkPromise = (async () => {
        calls += 1;
        try {
          return await work();
        } finally {
          checkPromise = null;
        }
      })();
      return checkPromise;
    },
  };
}

test("two overlapping checks share one in-flight work unit", async () => {
  let resolveWork;
  const work = () =>
    new Promise((resolve) => {
      resolveWork = resolve;
    });
  const checker = makeDedupeChecker(work);
  const a = checker.check();
  const b = checker.check();
  assert.equal(a, b);
  assert.equal(checker.calls, 1);
  resolveWork("ok");
  assert.equal(await a, "ok");
  assert.equal(await b, "ok");
  // After settle, a new check may run again.
  const c = checker.check();
  assert.notEqual(c, a);
});
