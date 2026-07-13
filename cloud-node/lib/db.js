const mysql = require("mysql2/promise");
const config = require("./config");

/** @type {import("mysql2/promise").Pool | null} */
let pool = null;

function getPool() {
  if (!pool) {
    if (!config.db.user || !config.db.password) {
      throw new Error("DB_USER and DB_PASSWORD must be set");
    }
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4_unicode_ci",
    });
  }
  return pool;
}

module.exports = { getPool };
