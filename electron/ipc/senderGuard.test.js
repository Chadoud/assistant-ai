"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { isTrustedSenderUrl, isTrustedSender } = require("./senderGuard");

test("accepts first-party app content URLs", () => {
  for (const url of [
    "file:///C:/app/index.html",
    "http://localhost:5173/",
    "http://127.0.0.1:5173/index.html",
    "devtools://devtools/bundled/inspector.html",
  ]) {
    assert.strictEqual(isTrustedSenderUrl(url), true, url);
  }
});

test("is permissive for transient empty / blank senders", () => {
  assert.strictEqual(isTrustedSenderUrl(""), true);
  assert.strictEqual(isTrustedSenderUrl("about:blank"), true);
  assert.strictEqual(isTrustedSenderUrl(null), true);
  assert.strictEqual(isTrustedSenderUrl(undefined), true);
});

test("rejects foreign origins", () => {
  for (const url of [
    "https://evil.example.com/",
    "http://example.com/",
    "data:text/html,<script>alert(1)</script>",
    "https://localhost.evil.com/",
  ]) {
    assert.strictEqual(isTrustedSenderUrl(url), false, url);
  }
});

test("rejects non-string URLs", () => {
  assert.strictEqual(isTrustedSenderUrl(42), false);
  assert.strictEqual(isTrustedSenderUrl({}), false);
});

test("isTrustedSender reads event.senderFrame.url", () => {
  assert.strictEqual(isTrustedSender({ senderFrame: { url: "file:///x" } }), true);
  assert.strictEqual(isTrustedSender({ senderFrame: { url: "https://evil.com" } }), false);
});

test("isTrustedSender fails closed when frame access throws", () => {
  const hostile = {
    get senderFrame() {
      throw new Error("frame destroyed");
    },
  };
  assert.strictEqual(isTrustedSender(hostile), false);
});
