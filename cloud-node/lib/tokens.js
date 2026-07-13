const jwt = require("jsonwebtoken");
const config = require("./config");

/**
 * @param {string} subject Account UUID
 * @param {"access" | "refresh"} tokenUse
 * @param {number} expiresInSeconds
 */
function signToken(subject, tokenUse, expiresInSeconds) {
  return jwt.sign(
    { sub: subject, token_use: tokenUse },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: expiresInSeconds },
  );
}

function signAccessToken(subject) {
  return signToken(subject, "access", config.accessMinutes * 60);
}

function signRefreshToken(subject, jti) {
  const id = typeof jti === "string" ? jti.trim() : "";
  if (!id) {
    throw new Error("refresh token jti required");
  }
  return jwt.sign(
    { sub: subject, token_use: "refresh", jti: id },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: config.refreshDays * 24 * 60 * 60 },
  );
}

/**
 * @param {string} token
 * @returns {import("jsonwebtoken").JwtPayload | null}
 */
function decodeToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    return typeof payload === "object" && payload !== null ? payload : null;
  } catch {
    return null;
  }
}

module.exports = { signAccessToken, signRefreshToken, decodeToken };
