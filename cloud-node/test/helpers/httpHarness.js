/** Minimal HTTP harness for route tests without extra dependencies. */

const http = require("http");

/**
 * @param {import("express").Express} app
 * @returns {Promise<{ fetch: (path: string, init?: RequestInit) => Promise<Response>, close: () => Promise<void> }>}
 */
function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("invalid listen address"));
        return;
      }
      const base = `http://127.0.0.1:${addr.port}`;
      resolve({
        fetch: (path, init = {}) => fetch(`${base}${path}`, init),
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

module.exports = { listenApp };
