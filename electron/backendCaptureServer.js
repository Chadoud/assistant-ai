/**
 * Loopback HTTP bridge so the Python backend can capture the screen through Electron.
 * Screen Recording permission then applies to **EXO** (same as the app).
 */

const http = require("http");
const state = require("./state");
const { ELECTRON_CAPTURE_PORT } = require("./constants");
const { capturePrimaryScreenJpeg } = require("./screenCaptureCore");

/** @type {import("http").Server | null} */
let server = null;

function verifyToken(req) {
  const expected = state.appToken ? String(state.appToken) : "";
  if (!expected) return false;
  const got = req.headers["x-app-token"];
  return typeof got === "string" && got === expected;
}

function startBackendCaptureServer() {
  if (server) return;

  server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/capture/screen") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    if (!verifyToken(req)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    const capture = await capturePrimaryScreenJpeg();
    if (!capture.ok) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(capture));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": String(capture.jpeg.length),
    });
    res.end(capture.jpeg);
  });

  server.listen(ELECTRON_CAPTURE_PORT, "127.0.0.1", () => {
    console.log(`[capture] backend bridge listening on 127.0.0.1:${ELECTRON_CAPTURE_PORT}`);
  });
  server.on("error", (err) => {
    console.error("[capture] backend bridge failed:", err.message);
  });
}

function stopBackendCaptureServer() {
  if (!server) return;
  server.close();
  server = null;
}

module.exports = { startBackendCaptureServer, stopBackendCaptureServer };
