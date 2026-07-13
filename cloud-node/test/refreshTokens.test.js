const test = require("node:test");
const assert = require("node:assert/strict");

test("rotateAuthTokens issues a new refresh token and revokes stale jti on reuse", async () => {
  const accountId = "acc-rotate-001";
  let storedJti = null;

  const pool = {
    async execute(sql, params = []) {
      if (/select refresh_token_jti/i.test(sql)) {
        return [[{ refresh_token_jti: storedJti }]];
      }
      if (/update accounts set refresh_token_jti/i.test(sql)) {
        storedJti = params[0];
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };

  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/refreshTokens")];
  delete require.cache[require.resolve("../lib/tokens")];
  require("../lib/db").getPool = () => pool;

  const { issueAuthTokens, rotateAuthTokens } = require("../lib/refreshTokens");
  const issued = await issueAuthTokens(accountId);
  assert.ok(issued.refresh_token);
  assert.ok(storedJti);

  const first = await rotateAuthTokens(issued.refresh_token);
  assert.equal(first.ok, true);
  assert.notEqual(first.refresh_token, issued.refresh_token);

  const reuse = await rotateAuthTokens(issued.refresh_token);
  assert.equal(reuse.ok, false);
  assert.equal(storedJti, null);
});
