const test = require("node:test");
const assert = require("node:assert/strict");
const { tenantIdFromAuthorization } = require("../fairQueue");

test("tenantIdFromAuthorization uses token suffix", () => {
  assert.equal(tenantIdFromAuthorization("Bearer sk-abc123456789"), "abc123456789");
  assert.equal(tenantIdFromAuthorization(""), "anonymous");
});
