const test = require("node:test");
const assert = require("node:assert/strict");

test("access and refresh tokens round-trip", () => {
  const { signAccessToken, signRefreshToken, decodeToken } = require("../lib/tokens");
  const sub = "11111111-2222-4333-8444-555555555555";
  const access = signAccessToken(sub);
  const refresh = signRefreshToken(sub, "jti-test-001");
  const accessPayload = decodeToken(access);
  const refreshPayload = decodeToken(refresh);
  assert.equal(accessPayload?.sub, sub);
  assert.equal(accessPayload?.token_use, "access");
  assert.equal(refreshPayload?.token_use, "refresh");
  assert.equal(refreshPayload?.jti, "jti-test-001");
});

test("refresh token requires jti", () => {
  const { signRefreshToken } = require("../lib/tokens");
  assert.throws(() => signRefreshToken("acc", ""), /jti required/);
});
