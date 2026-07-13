const { test } = require("node:test");
const assert = require("node:assert");
const { createErrorCapture, stripAnsi } = require("./buildErrorCapture");

test("captures the matched error line plus following context lines", () => {
  const capture = createErrorCapture();
  capture.push("The following dependencies are imported but could not be resolved:");
  capture.push("  uuid (imported by /Users/x/.ai-manager/studio/s1/src/App.tsx)");
  capture.push("Are they installed?");

  const snapshot = capture.snapshot();
  assert.ok(snapshot.includes("could not be resolved"));
  assert.ok(snapshot.includes("uuid (imported by"), "context line with the package name is kept");
  assert.ok(snapshot.includes("Are they installed?"));
});

test("recovery signal clears a prior error", () => {
  const capture = createErrorCapture();
  capture.push("Failed to resolve import \"./Missing\" from \"src/App.tsx\"");
  assert.ok(capture.snapshot());
  capture.push("hmr update /src/App.tsx");
  assert.strictEqual(capture.snapshot(), null);
});

test("strips ANSI escape codes so patterns match colored vite output", () => {
  const capture = createErrorCapture();
  capture.push("\x1b[31mFailed to resolve dependency:\x1b[39m \x1b[36muuid\x1b[39m");
  const snapshot = capture.snapshot();
  assert.ok(snapshot.includes("Failed to resolve dependency: uuid"));
  assert.ok(!snapshot.includes("\x1b["));
});

test("caps the captured error size", () => {
  const capture = createErrorCapture();
  capture.push("Failed to compile");
  for (let i = 0; i < 20; i++) capture.push("x".repeat(300));
  assert.ok(capture.snapshot().length <= 1500);
});

test("ignores unrelated lines and stays empty", () => {
  const capture = createErrorCapture();
  capture.push("vite v5.2.0 dev server running at:");
  capture.push("> Local: http://127.0.0.1:5300/");
  assert.strictEqual(capture.snapshot(), null);
});

test("stripAnsi removes color codes", () => {
  assert.strictEqual(stripAnsi("\x1b[32mok\x1b[0m"), "ok");
});
