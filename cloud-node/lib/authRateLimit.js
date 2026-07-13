/** Rate limiting for auth endpoints (register/login). */

const { allow } = require("./rateLimit");

const REGISTER_MAX = 8;
const LOGIN_MAX = 20;
const REFRESH_MAX = 60;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return String(req.ip || "unknown").slice(0, 64);
}

/**
 * @param {"register"|"login"|"refresh"} action
 */
function authRateLimitMiddleware(action) {
  const max =
    action === "register" ? REGISTER_MAX : action === "login" ? LOGIN_MAX : REFRESH_MAX;
  return (req, res, next) => {
    const key = `auth:${action}:${clientIp(req)}`;
    if (!allow(key, max, WINDOW_MS)) {
      return res.status(429).json({ detail: "rate_limit_exceeded" });
    }
    return next();
  };
}

module.exports = { authRateLimitMiddleware, clientIp };
