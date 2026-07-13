const { test } = require("node:test");
const assert = require("node:assert");
const { hasAsciiControlOrDel } = require("./controlChars");

test("hasAsciiControlOrDel", () => {
  assert.strictEqual(hasAsciiControlOrDel("hello:track:x"), false);
  assert.strictEqual(hasAsciiControlOrDel("a\u0000b"), true);
});
