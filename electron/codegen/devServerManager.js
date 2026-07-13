/**
 * Managed codegen dev servers — install, long-running dev, port detection.
 */

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { assertCodegenCommand } = require("./commandPolicy");
const { createErrorCapture, stripAnsi } = require("./buildErrorCapture");

const PORT_MIN = 5300;
const PORT_MAX = 5399;

/** @type {Map<string, { proc: import('child_process').ChildProcess, port: number | null, url: string | null, logs: string[], cwd: string, phase: string }>} */
const sessions = new Map();

/** @type {Map<string, string>} resolved cwd -> active session id */
const cwdToSession = new Map();

/** @type {Set<number>} */
const usedPorts = new Set();

function allocatePort() {
  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    if (!usedPorts.has(p)) {
      usedPorts.add(p);
      return p;
    }
  }
  throw new Error("No free preview ports in range 5300–5399");
}

function releasePort(port) {
  if (typeof port === "number") usedPorts.delete(port);
}

function appendLog(sessionId, line) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  const clean = stripAnsi(line);
  entry.logs.push(clean);
  if (entry.logs.length > 400) entry.logs.shift();
  if (!entry.errorCapture) entry.errorCapture = createErrorCapture();
  entry.errorCapture.push(clean);
  entry.buildError = entry.errorCapture.snapshot();
}

function detectPortFromLine(line, fallback) {
  const m =
    line.match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/i) ||
    line.match(/(?:Local|Network):\s*https?:\/\/[^\s:]+:(\d+)/i) ||
    line.match(/:(\d{4,5})\s*$/);
  if (m) {
    const p = parseInt(m[1], 10);
    if (p >= 1024 && p <= 65535) return p;
  }
  return fallback;
}

const DEV_READY_TIMEOUT_MS = 40000;
/**
 * Short window after the server answers HTTP so an immediate startup error can
 * surface in the first response. The renderer no longer relies on this timer —
 * it polls status + DOM probes until a definitive compile signal appears.
 */
const BUILD_SETTLE_MS = 600;

/**
 * Wait until the dev server actually answers HTTP, or fail fast if it dies.
 *
 * Polls the port the server logged (preferred) or the allocated fallback. The
 * key difference from a best-effort health check: a process exit or timeout
 * resolves `{ ok: false }` so the caller can surface a real error instead of
 * claiming "ready" against a port nothing is listening on.
 *
 * @returns {Promise<{ ok: true, port: number, url: string } | { ok: false, error: string }>}
 */
function waitForServerReady(proc, getDetectedPort, fallbackPort, timeoutMs = DEV_READY_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();

    const onClose = (code) =>
      settle({ ok: false, error: `Dev server process exited (code ${code}) before it started serving.` });

    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (proc) proc.removeListener("close", onClose);
      resolve(result);
    };

    if (proc) proc.on("close", onClose);

    const retry = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        settle({ ok: false, error: "Dev server did not respond before the timeout." });
      } else {
        setTimeout(tick, 500);
      }
    };

    const tick = () => {
      if (settled) return;
      const port = getDetectedPort() || fallbackPort;
      const url = `http://127.0.0.1:${port}/`;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) settle({ ok: true, port, url });
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(3000, () => req.destroy());
    };

    tick();
  });
}

function isTrustedStudioPath(cwd) {
  try {
    const home = require("os").homedir();
    const studioRoot = path.join(home, ".ai-manager", "studio");
    const resolved = path.resolve(cwd);
    const rel = path.relative(studioRoot, resolved);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

function resolveCwdKey(cwd) {
  return path.resolve(cwd);
}

function findRunningEntryForCwd(cwd) {
  const key = resolveCwdKey(cwd);
  const sessionId = cwdToSession.get(key);
  if (!sessionId) return null;
  const entry = sessions.get(sessionId);
  if (!entry || !entry.proc || entry.proc.killed || entry.phase !== "ready" || !entry.url) {
    return null;
  }
  return { sessionId, entry };
}

function killSession(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  const { proc, port, cwd } = entry;
  try {
    if (process.platform === "win32" && proc.pid) {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else if (proc.pid) {
      // The child was spawned detached (its own process group), so a negative
      // PID signals the whole tree (npm + vite/next children), not just `sh`.
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-proc.pid, "SIGKILL");
        } catch {
          /* already exited */
        }
      }, 2000);
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* ignore */
  }
  releasePort(port);
  sessions.delete(sessionId);
  if (cwd) {
    const key = resolveCwdKey(cwd);
    if (cwdToSession.get(key) === sessionId) cwdToSession.delete(key);
  }
}

function runCommand(sessionId, cwd, command, { onLine, phase }) {
  return new Promise((resolve, reject) => {
    if (!isTrustedStudioPath(cwd)) {
      reject(new Error("Project path is outside the codegen studio directory"));
      return;
    }
    try {
      assertCodegenCommand(command);
    } catch (err) {
      reject(err);
      return;
    }
    const entry = sessions.get(sessionId) || { logs: [], cwd, phase, proc: null, port: null, url: null };
    entry.phase = phase;
    sessions.set(sessionId, entry);

    const isWin = process.platform === "win32";
    const proc = spawn(isWin ? "cmd.exe" : "sh", isWin ? ["/d", "/s", "/c", command] : ["-c", command], {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // On POSIX, run in its own process group so killSession can terminate the
      // whole dev-server tree (npm + vite/next) via a negative PID, not just sh.
      detached: !isWin,
    });
    entry.proc = proc;

    const handle = (buf) => {
      const text = buf.toString();
      text.split(/\r?\n/).forEach((line) => {
        if (!line.trim()) return;
        appendLog(sessionId, line);
        if (onLine) onLine(line);
      });
    };
    proc.stdout.on("data", handle);
    proc.stderr.on("data", handle);
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (phase === "install") {
        if (code === 0) resolve({ ok: true });
        else reject(new Error(`Install exited with code ${code}`));
      }
    });
    if (phase === "dev") {
      resolve({ ok: true, proc });
    }
  });
}

async function startDevServer(sessionId, cwd, devCommand, options = {}) {
  const reuseIfRunning = Boolean(options.reuseIfRunning);
  if (reuseIfRunning) {
    const existing = findRunningEntryForCwd(cwd);
    if (existing) {
      const { entry } = existing;
      sessions.set(sessionId, {
        proc: entry.proc,
        port: entry.port,
        url: entry.url,
        logs: entry.logs,
        cwd,
        phase: "ready",
      });
      cwdToSession.set(resolveCwdKey(cwd), sessionId);
      appendLog(sessionId, "Reusing running dev server for project.");
      return {
        port: entry.port,
        url: entry.url,
        logTail: entry.logs.slice(-40).join("\n"),
        reused: true,
      };
    }
  }

  const priorForCwd = findRunningEntryForCwd(cwd);
  if (priorForCwd && priorForCwd.sessionId !== sessionId) {
    killSession(priorForCwd.sessionId);
  }
  killSession(sessionId);

  const port = allocatePort();
  let cmd = devCommand;
  if (!/\b--port\b|\b-p\b|\b-l\b|\blisten\b/i.test(cmd)) {
    if (/vite/i.test(cmd)) cmd = `${cmd} --host 127.0.0.1 --port ${port}`;
    else if (/next/i.test(cmd)) cmd = `${cmd} -p ${port}`;
    else if (/serve/i.test(cmd)) cmd = cmd.replace(/-l\s+\d+/, `-l ${port}`);
  }

  let resolvedPort = null;
  await runCommand(sessionId, cwd, cmd, {
    phase: "dev",
    onLine: (line) => {
      const detected = detectPortFromLine(line, null);
      if (detected) resolvedPort = detected;
    },
  });

  const entry = sessions.get(sessionId);
  if (!entry) throw new Error("Dev server session lost");

  const ready = await waitForServerReady(entry.proc, () => resolvedPort, port);
  if (!ready.ok) {
    const tail = entry.logs.slice(-40).join("\n");
    killSession(sessionId);
    throw new Error(tail ? `${ready.error}\n\n${tail}` : ready.error);
  }

  entry.port = ready.port;
  entry.url = ready.url;
  entry.phase = "ready";
  entry.cwd = cwd;
  cwdToSession.set(resolveCwdKey(cwd), sessionId);

  // Vite/Next answer HTTP 200 even when the app fails to compile (error overlay).
  // Give the first build a brief settle window so a compile error surfaces in
  // the logs and can be reported for self-correction instead of a blank preview.
  await new Promise((r) => setTimeout(r, BUILD_SETTLE_MS));
  return {
    port: ready.port,
    url: ready.url,
    logTail: entry.logs.slice(-40).join("\n"),
    buildError: entry.buildError || null,
  };
}

async function runInstall(sessionId, cwd, installCommand, options = {}) {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    const entry = sessions.get(sessionId) || { logs: [], cwd, phase: "install_skipped", proc: null, port: null, url: null };
    entry.phase = "install_skipped";
    sessions.set(sessionId, entry);
    appendLog(sessionId, "Skipped install — no package.json (static project).");
    return { ok: true, skipped: true, logTail: entry.logs.slice(-40).join("\n") };
  }
  if (options.skipIfReady && fs.existsSync(path.join(cwd, "node_modules"))) {
    const entry = sessions.get(sessionId) || { logs: [], cwd, phase: "install", proc: null, port: null, url: null };
    entry.phase = "install_skipped";
    sessions.set(sessionId, entry);
    appendLog(sessionId, "Skipped install — node_modules already present.");
    return { ok: true, skipped: true, logTail: entry.logs.slice(-40).join("\n") };
  }
  await runCommand(sessionId, cwd, installCommand, { phase: "install" });
  const entry = sessions.get(sessionId);
  if (entry) entry.cwd = cwd;
  return { ok: true, logTail: (entry?.logs || []).slice(-40).join("\n") };
}

function getStatus(sessionId) {
  const entry = sessions.get(sessionId);
  if (!entry) return { running: false, port: null, url: null, logTail: "", phase: "idle", buildError: null };
  return {
    running: entry.proc && !entry.proc.killed,
    port: entry.port,
    url: entry.url,
    logTail: entry.logs.slice(-80).join("\n"),
    phase: entry.phase,
    cwd: entry.cwd,
    buildError: entry.buildError || null,
  };
}

function killAll() {
  for (const id of [...sessions.keys()]) killSession(id);
}

module.exports = {
  startDevServer,
  runInstall,
  getStatus,
  killSession,
  killAll,
  isTrustedStudioPath,
};
