const { decodeToken } = require("../lib/tokens");

/** Sets req.accountId when a valid Bearer access token is present; otherwise continues. */
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const payload = decodeToken(header.slice(7).trim());
    if (payload && payload.token_use === "access" && payload.sub) {
      req.accountId = String(payload.sub);
    }
  }
  return next();
}

module.exports = { optionalAuth };
