const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  trimDiagnosticsLogIfOversized,
  MAX_LOG_BYTES,
  TRIM_KEEP_LINES,
} = require("./rendererDiagnostics");

test("trimDiagnosticsLogIfOversized keeps tail when file exceeds cap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-diag-"));
  const logPath = path.join(dir, "renderer-diagnostics.log");
  const bigLine = "x".repeat(300);
  const lines = Array.from({ length: TRIM_KEEP_LINES + 500 }, (_, i) => `${bigLine}-line-${i}`);
  fs.writeFileSync(logPath, lines.join("\n") + "\n", "utf8");
  assert.ok(fs.statSync(logPath).size > MAX_LOG_BYTES);

  trimDiagnosticsLogIfOversized(logPath);
  const kept = fs.readFileSync(logPath, "utf8").trim().split("\n");
  assert.equal(kept.length, TRIM_KEEP_LINES);
  assert.match(kept[0], /-line-500$/);
  assert.match(kept[kept.length - 1], /-line-2499$/);
});
