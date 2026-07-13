const { test } = require("node:test");
const assert = require("node:assert/strict");
const { googleAppExportTarget, safeLocalBasename } = require("./googleDriveExportMap");

test("googleAppExportTarget maps native Google apps to export mime + extension", () => {
  assert.deepEqual(googleAppExportTarget("application/vnd.google-apps.document"), {
    exportMime: "application/pdf",
    ext: ".pdf",
  });
  assert.equal(googleAppExportTarget("application/vnd.google-apps.drawing")?.ext, ".png");
  assert.equal(googleAppExportTarget("application/pdf"), null);
});

test("safeLocalBasename strips forbidden filename chars", () => {
  assert.equal(safeLocalBasename('foo<>:"/\\|?*bar', ".txt"), "foo_________bar.txt");
});
