const test = require("node:test");
const assert = require("node:assert/strict");
const { accountHasSortAccess } = require("../lib/sortAccess");

test("accountHasSortAccess allows active trial", () => {
  assert.equal(accountHasSortAccess({ trial_active: true, entitlements: [] }), true);
});

test("accountHasSortAccess allows active sort entitlement", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", active: true }],
    }),
    true,
  );
});

test("accountHasSortAccess denies expired trial without entitlement", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", active: false }],
    }),
    false,
  );
});
