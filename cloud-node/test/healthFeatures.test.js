const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../lib/config");

test("sort_credentials feature is true when master key or delegation is configured", () => {
  const sortCredentials = Boolean(
    config.sortLlm.mockToken || config.sortLlm.masterKey || config.sortLlm.allowMasterDelegation,
  );
  if (process.env.LITELLM_MASTER_KEY || process.env.SORT_LLM_MOCK_TOKEN) {
    assert.equal(sortCredentials, true);
  } else if (process.env.SORT_LLM_ALLOW_MASTER_DELEGATION === "1") {
    assert.equal(sortCredentials, true);
  } else {
    assert.equal(sortCredentials, false);
  }
});
