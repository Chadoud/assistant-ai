const test = require("node:test");
const assert = require("node:assert/strict");

const { CRASH_FILTER_PREDICATE, crashFilterSql } = require("../lib/crashFilter");

test("crashFilterSql includes verify and pytest exclusions", () => {
  const sql = crashFilterSql("c");
  assert.match(sql, /c\.app_version NOT IN/);
  assert.match(sql, /Test error for pytest/);
  assert.match(sql, /verify-%/);
});

test("CRASH_FILTER_PREDICATE excludes script source", () => {
  assert.match(CRASH_FILTER_PREDICATE, /source NOT IN \('script', 'selftest'\)/);
});
