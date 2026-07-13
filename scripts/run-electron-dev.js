/**
 * Spawns Electron with NODE_ENV=development and, on macOS, ELECTRON_OVERRIDE_DIST_PATH
 * when electron/dev-macos/Electron.app exists (see scripts/prepare-mac-dev-app.cjs).
 */
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const macDir = path.join(root, "electron", "dev-macos");
const branded = path.join(macDir, "Electron.app");

if (process.platform === "darwin") {
  const prepare = path.join(__dirname, "prepare-mac-dev-app.cjs");
  try {
    require("child_process").execSync(`node "${prepare}"`, { cwd: root, stdio: "inherit" });
  } catch (err) {
    console.warn("[run-electron-dev] prepare-mac-dev-app failed:", err && err.message);
  }
}

if (process.platform === "darwin" && fs.existsSync(branded)) {
  process.env.ELECTRON_OVERRIDE_DIST_PATH = macDir;
}

const cli = path.join(root, "node_modules", "electron", "cli.js");
const useProcessGroup = process.platform !== "win32";

const child = spawn(process.execPath, [cli, "."], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  detached: useProcessGroup,
});

let shuttingDown = false;
let forceExitTimer = null;

function killChild(force) {
  if (!child.pid || child.killed) return;
  const signal = force ? "SIGKILL" : process.platform === "win32" ? "SIGTERM" : "SIGINT";
  try {
    if (useProcessGroup) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    try {
      child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function freeDevPorts() {
  try {
    execSync("npx kill-port 5173 7799", { cwd: root, stdio: "ignore" });
  } catch {
    /* ports may already be free */
  }
}

function shutdown() {
  if (shuttingDown) {
    killChild(true);
    freeDevPorts();
    process.exit(130);
  }
  shuttingDown = true;

  killChild(false);

  forceExitTimer = setTimeout(() => {
    killChild(true);
    freeDevPorts();
    process.exit(0);
  }, 2000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", (code, signal) => {
  if (forceExitTimer) clearTimeout(forceExitTimer);
  if (signal === "SIGINT" || signal === "SIGTERM" || signal === "SIGKILL") {
    process.exit(0);
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[run-electron-dev]", err);
  process.exit(1);
});
