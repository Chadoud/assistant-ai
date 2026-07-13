/**
 * Shared loopback OAuth callback server helper.
 *
 * Replaces copy-pasted `listenLoopback()` in google.js, microsoft.js,
 * dropbox.js, and infomaniak.js.
 *
 * Two modes:
 *  - port 0 (default): OS assigns a random available port — required for
 *    providers that accept dynamic loopback URIs (Google, Dropbox).
 *  - fixed port: use a specific port registered in the provider's developer
 *    console (Microsoft, Infomaniak).
 *
 * Dual-stack loopback (`dualStackLoopback: true`, fixed port only): bind BOTH
 * `127.0.0.1` and `::1` on the same port. Needed when the registered redirect URI
 * uses the host name `localhost` (e.g. Notion), because the browser may resolve
 * `localhost` to IPv6 `::1` while a single IPv4 bind would refuse the connection
 * (`ERR_CONNECTION_REFUSED`). Binding both families makes the callback reachable
 * regardless of how `localhost` resolves on the user's machine.
 */

const http = require("http");

const LOOPBACK_HOSTS = ["127.0.0.1", "::1"];

/** Resolve a listen() into a promise, cleaning up the one-shot error listener. */
function listenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => reject(err);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
}

/**
 * Start a single loopback server bound to 127.0.0.1 (supports random ports).
 * @returns {Promise<{ server: import('http').Server; port: number; close: () => Promise<void> }>}
 */
function startSingleLoopback(port, label) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const onListenError = (err) => reject(err);
    server.once("error", onListenError);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", onListenError);
      server.on("error", (e) => console.error(`${label} loopback server error:`, e));
      const addr = server.address();
      const resolvedPort = port !== 0 ? port : typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        server,
        port: resolvedPort,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

/**
 * Start loopback servers on both IPv4 and IPv6 loopback for the same fixed port.
 * Best-effort per family: if one family can't bind (no IPv6 stack, etc.) the other
 * still serves; only a total failure rejects. The returned `server` is a facade that
 * forwards `.on(...)` registrations to every bound server so callers keep one handler.
 * @returns {Promise<{ server: { on: (event: string, handler: Function) => unknown }; port: number; close: () => Promise<void> }>}
 */
async function startDualStackLoopback(port, label) {
  if (!port) throw new Error("dualStackLoopback requires a fixed, non-zero port");

  const servers = [];
  let lastError = null;
  for (const host of LOOPBACK_HOSTS) {
    const server = http.createServer();
    try {
      await listenOnce(server, port, host);
      server.on("error", (e) => console.error(`${label} loopback server error:`, e));
      servers.push(server);
    } catch (err) {
      lastError = err;
      console.warn(`${label} could not bind ${host}:${port}: ${err?.code || err?.message}`);
      server.close(() => {});
    }
  }

  if (servers.length === 0) {
    throw lastError || new Error(`${label} loopback bind failed on port ${port}`);
  }

  const facade = {
    on(event, handler) {
      for (const s of servers) s.on(event, handler);
      return facade;
    },
  };

  return {
    server: facade,
    port,
    close: () =>
      Promise.all(servers.map((s) => new Promise((res) => s.close(() => res())))).then(() => {}),
  };
}

/**
 * Start a temporary loopback HTTP server to receive the OAuth callback.
 *
 * @param {{ port?: number; label?: string; dualStackLoopback?: boolean }} [options]
 *   - `port` — port to listen on; defaults to 0 (random).
 *   - `label` — short prefix for error log lines (e.g. "[microsoft]").
 *   - `dualStackLoopback` — bind both 127.0.0.1 and ::1 (requires a fixed port);
 *     use when the redirect URI host is `localhost`.
 * @returns {Promise<{ server: any; port: number; close: () => Promise<void> }>}
 */
function startLoopbackServer({ port = 0, label = "[oauth]", dualStackLoopback = false } = {}) {
  if (dualStackLoopback) return startDualStackLoopback(port, label);
  return startSingleLoopback(port, label);
}

module.exports = { startLoopbackServer };
