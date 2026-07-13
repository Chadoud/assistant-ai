const test = require("node:test");
const assert = require("node:assert/strict");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");

function mockReq(ip = "203.0.113.10") {
  return { ip, headers: {} };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("auth rate limit allows first requests then blocks", () => {
  const middleware = authRateLimitMiddleware("register");
  const req = mockReq();
  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  for (let i = 0; i < 8; i += 1) {
    const res = mockRes();
    middleware(req, res, next);
    assert.equal(res.statusCode, 200);
  }
  const blocked = mockRes();
  middleware(req, blocked, next);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.detail, "rate_limit_exceeded");
  assert.equal(nextCount, 8);
});
