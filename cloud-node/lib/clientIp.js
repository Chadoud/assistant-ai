/**
 * @param {import("express").Request} req
 * @returns {string}
 */
function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return String(req.ip || "unknown").slice(0, 64);
}

module.exports = { clientIp };
