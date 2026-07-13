const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeError } = require("./mainProcessDiagnostics");

test("normalizeError extracts message and stack from Error", () => {
  const err = new Error("boom");
  const out = normalizeError(err);
  assert.equal(out.message, "boom");
  assert.match(String(out.stack), /Error: boom/);
});

test("normalizeError stringifies non-Error values", () => {
  const out = normalizeError("plain failure");
  assert.equal(out.message, "plain failure");
  assert.equal(out.stack, null);
});
