/** Setup wizard orchestration — installs Ollama, pulls the model, installs Tesseract. */

const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const state = require("../state");
const {
  IS_WIN, IS_MAC, OLLAMA_PORT, DEFAULT_SETUP_MODEL,
  OLLAMA_TAGS_TIMEOUT_MS, OLLAMA_PULL_TIMEOUT_MS, TESSERACT_SPAWN_TIMEOUT_MS,
} = require("../constants");
const {
  isOllamaInstalled,
  isOllamaRunning,
  isModelPulled,
  spawnOllamaServeDetached,
  fetchOllamaTags,
  isRemoteOllamaMode,
} = require("../ollama");
const { delay } = require("../utils");

// ── Setup window UI helpers ───────────────────────────────────────────────────
// These call page functions directly via executeJavaScript, bypassing IPC/contextIsolation.

function setupStep(id, st) {
  const s = JSON.stringify;
  state.setupWindow?.webContents
    ?.executeJavaScript(`setStep(${s(id)}, ${s(st)})`)
    .catch(() => {});
}

function setupLog(msg) {
  console.log("[setup]", msg);
}

function setupProgress(pct) {
  state.setupWindow?.webContents
    ?.executeJavaScript(`setProgress(${Number(pct)})`)
    .catch(() => {});
}

function setupDone() {
  state.setupWindow?.webContents
    ?.executeJavaScript(`setProgress(100); showLaunchBtn()`)
    .catch(() => {});
}

function setupStepStatus(id, text) {
  const escaped = JSON.stringify(text);
  state.setupWindow?.webContents
    ?.executeJavaScript(
      `(function(){ var el = document.getElementById('step-${id}-label'); if(el) el.textContent = ${escaped}; })()`
    )
    .catch(() => {});
}

function setupStepProgress(id, pct) {
  state.setupWindow?.webContents
    ?.executeJavaScript(`setStepProgress(${JSON.stringify(id)}, ${Number(pct)})`)
    .catch(() => {});
}

/** Hide local-Ollama checklist rows when sort runs on Exo cloud infrastructure. */
function configureCloudSetupUi() {
  state.setupWindow?.webContents
    ?.executeJavaScript(
      `(function(){
        ["ollama","start","model"].forEach(function(id){
          var el = document.getElementById("step-" + id);
          if (el) el.style.display = "none";
        });
        var h1 = document.querySelector("h1");
        if (h1) h1.textContent = "Getting Exo ready";
      })()`
    )
    .catch(() => {});
}

/**
 * Returns the highest 0–100 value matching `NN%` / `NN.N%` in installer output
 * (brew/curl, winget, apt, choco often print these).
 */
function extractMaxPercent0to100(text) {
  let max = null;
  const re = /(\d+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = parseFloat(m[1]);
    if (!Number.isFinite(v)) continue;
    const c = Math.min(100, Math.max(0, Math.round(v)));
    if (max === null || c > max) max = c;
  }
  return max;
}

/**
 * Tracks streamed stdout/stderr from package managers and updates the OCR step bar
 * when a monotonic percentage is detected.
 */
function createOcrInstallProgressTracker() {
  const tailMax = 65536;
  let buf = "";
  let lastReported = -1;
  return (chunk) => {
    buf += chunk.toString();
    if (buf.length > tailMax) buf = buf.slice(-tailMax);
    const pct = extractMaxPercent0to100(buf);
    if (pct !== null && pct > lastReported) {
      lastReported = pct;
      setupStepProgress("ocr", pct);
      setupStepStatus("ocr", `Installing Tesseract OCR… ${pct}%`);
    }
  };
}

// ── OCR helpers ───────────────────────────────────────────────────────────────

const WIN_TESSERACT_DIRS = [
  "C:\\Program Files\\Tesseract-OCR",
  "C:\\Program Files (x86)\\Tesseract-OCR",
  path.join(os.homedir(), "AppData", "Local", "Programs", "Tesseract-OCR"),
];

const MAC_TESSERACT_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

function refreshTesseractPath() {
  if (IS_WIN) {
    for (const dir of WIN_TESSERACT_DIRS) {
      if (fs.existsSync(path.join(dir, "tesseract.exe"))) {
        if (!process.env.PATH.includes(dir)) {
          process.env.PATH = dir + ";" + process.env.PATH;
        }
        return;
      }
    }
    return;
  }
  if (IS_MAC) {
    for (const dir of MAC_TESSERACT_BIN_DIRS) {
      if (fs.existsSync(path.join(dir, "tesseract"))) {
        if (!process.env.PATH.includes(dir)) {
          process.env.PATH = `${dir}:${process.env.PATH}`;
        }
        return;
      }
    }
  }
}

function isTesseractInstalled() {
  refreshTesseractPath();
  if (IS_WIN) {
    for (const dir of WIN_TESSERACT_DIRS) {
      if (fs.existsSync(path.join(dir, "tesseract.exe"))) return true;
    }
  }
  try {
    const result = spawnSync("tesseract", ["--version"], { shell: true, timeout: TESSERACT_SPAWN_TIMEOUT_MS });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Query the locally running Ollama API and return the first vision-capable
 * model name found, or null if none is installed / Ollama is not running.
 */
async function fetchOllamaVisionModel() {
  // Keep in sync with VISION_KEYWORDS in backend/vision.py
  const VISION_KEYWORDS = ['llava', 'moondream', 'bakllava', 'minicpm-v', 'llava-llama3', 'llava-phi3'];
  const models = await fetchOllamaTags(OLLAMA_TAGS_TIMEOUT_MS);
  if (!models) return null;
  const found = models.find((m) =>
    VISION_KEYWORDS.some((kw) => String(m.name ?? '').toLowerCase().includes(kw))
  );
  return found ? found.name : null;
}

async function getOcrCapabilities() {
  refreshTesseractPath(); // ensure PATH includes the known Tesseract install dirs on Windows
  const tesseractCheck = spawnSync("tesseract", ["--version"], { shell: true, timeout: 3000 });
  const tesseractInstalled = tesseractCheck.status === 0;
  let tesseractVersion = "";
  if (tesseractInstalled) {
    const firstLine = (tesseractCheck.stdout || "").toString().split("\n")[0] || "";
    tesseractVersion = firstLine.trim();
  }

  let languages = [];
  if (tesseractInstalled) {
    const langsCheck = spawnSync("tesseract", ["--list-langs"], { shell: true, timeout: 3000 });
    const raw = (langsCheck.stdout || "")
      .toString()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    languages = raw.filter(
      (line) => !line.toLowerCase().startsWith("list of available languages")
    );
  }

  const hasEnglish = languages.some((l) => l.toLowerCase() === "eng");
  const hasFrench = languages.some(
    (l) => l.toLowerCase() === "fra" || l.toLowerCase() === "fre"
  );

  const status = tesseractInstalled ? (hasEnglish ? "ready" : "partial") : "missing";

  const visionModelName = await fetchOllamaVisionModel();

  return {
    status,
    tesseractInstalled,
    tesseractVersion,
    languages,
    hasEnglish,
    hasFrench,
    visionFallbackAvailable: visionModelName !== null,
    visionModelName,
  };
}

// ── OCR user-consent promises (resolved via IPC in ipc/setupHandlers.js) ─────

function askUserConfirmOcr() {
  return new Promise((resolve) => {
    state._ocrConfirmResolve = resolve;
    state.setupWindow?.webContents
      .executeJavaScript("showOcrConfirm()")
      .catch(() => resolve(true));
  });
}

function waitForOcrRetry() {
  return new Promise((resolve) => {
    state._ocrRetryResolve = resolve;
    state.setupWindow?.webContents
      .executeJavaScript("showOcrRetry()")
      .catch(() => resolve());
  });
}

/**
 * Installs Tesseract when missing. Caller only invokes when not already installed.
 * @returns {"installed" | "skipped" | "failed"}
 */
async function installTesseract() {
  const confirmed = await askUserConfirmOcr();
  if (!confirmed) {
    setupStep("ocr", "error");
    setupStepStatus(
      "ocr",
      "Skipped — install Tesseract later in Settings for better scans"
    );
    return "skipped";
  }

  setupStepStatus("ocr", "Installing Tesseract OCR…");

  const cmd = IS_WIN
    ? 'if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id UB-Mannheim.TesseractOCR -e --accept-source-agreements --accept-package-agreements } elseif (Get-Command choco -ErrorAction SilentlyContinue) { choco install tesseract -y } else { exit 1 }'
    : process.platform === "darwin"
    ? "if command -v brew >/dev/null 2>&1; then HOMEBREW_NO_AUTO_UPDATE=1 brew install tesseract || true; fi"
    : "if command -v apt-get >/dev/null 2>&1; then (sudo -n apt-get update && sudo -n apt-get install -y tesseract-ocr) || true; fi";

  try {
    await new Promise((resolve) => {
      const onOcrChunk = createOcrInstallProgressTracker();
      const proc = IS_WIN
        ? spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd], {
            shell: false,
            stdio: "pipe",
            windowsHide: true,
          })
        : spawn("bash", ["-c", cmd], { shell: false, stdio: "pipe" });

      const logChunk = (d) => {
        const txt = d.toString().trim();
        if (txt) console.log("[setup][ocr]", txt);
        onOcrChunk(d);
      };
      proc.stdout.on("data", logChunk);
      proc.stderr.on("data", logChunk);
      proc.on("error", () => resolve());
      proc.on("exit", () => resolve());
    });
  } catch {
    /* best effort; result verified below */
  }

  refreshTesseractPath();
  const ok = isTesseractInstalled();
  if (ok) {
    setupStepProgress("ocr", 100);
    setupStep("ocr", "done");
    setupStepStatus("ocr", "Tesseract OCR ready");
    return "installed";
  }
  setupStep("ocr", "error");
  setupStepStatus("ocr", "Installation failed — click Retry to try again");
  return "failed";
}

// ── Shared NDJSON streaming pull for Ollama models ───────────────────────────

/**
 * Stream an Ollama model pull, reporting progress via the setup UI.
 * @param {string} modelName  - Ollama model name (e.g. "mistral", "moondream:latest")
 * @param {string} stepId     - Setup UI step id ("model" | "ocr")
 * @param {function|null} onProgress - Optional extra callback(pct) for overall bar updates
 */
function ollamaPullStream(modelName, stepId, onProgress = null) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: modelName, stream: true });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: OLLAMA_PORT,
        path: "/api/pull",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.error) { reject(new Error(msg.error)); return; }
              if (msg.status === "success") { resolve(); return; }
              if (msg.total > 0 && msg.completed !== undefined) {
                const pct = Math.round((msg.completed / msg.total) * 100);
                setupStepProgress(stepId, pct);
                setupStepStatus(stepId, `Downloading ${modelName}… ${pct}%`);
                if (onProgress) onProgress(pct);
              } else if (msg.status) {
                setupStepStatus(stepId, msg.status);
              }
            } catch {
              /* incomplete JSON chunk */
            }
          }
        });
        res.on("end", resolve);
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(OLLAMA_PULL_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`${modelName} pull timed out`));
    });
    req.write(body);
    req.end();
  });
}

function pullModel() {
  return ollamaPullStream(DEFAULT_SETUP_MODEL, "model", (pct) => {
    setupProgress(50 + Math.round(pct * 0.35));
  });
}

// ── Main setup flow ───────────────────────────────────────────────────────────

async function runSetup() {
  setupLog("Starting setup...");
  setupProgress(5);

  const remoteLlm = isRemoteOllamaMode();

  if (remoteLlm) {
    setupLog("Cloud sort — skipping local Ollama install and model download.");
    configureCloudSetupUi();
    setupStep("ollama", "done");
    setupStep("start", "done");
    setupStep("model", "done");
    setupProgress(50);
  } else {
  // Step 1: Install Ollama
  if (isOllamaInstalled()) {
    setupLog("Ollama is already installed.");
    setupStep("ollama", "done");
    setupProgress(30);
  } else {
    setupStep("ollama", "active");
    setupLog(IS_WIN ? "Installing Ollama via PowerShell..." : "Installing Ollama via curl...");
    try {
      await new Promise((resolve, reject) => {
        const proc = IS_WIN
          ? spawn(
              "powershell.exe",
              [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "irm https://ollama.com/install.ps1 | iex",
              ],
              { shell: false, stdio: "pipe", windowsHide: true }
            )
          : spawn("bash", ["-c", "curl -fsSL https://ollama.com/install.sh | sh"], {
              shell: false,
              stdio: "pipe",
            });

        // The step bar stays in its honest indeterminate state until the
        // installer emits real percentages — no timer-driven fake progress.
        setupStepStatus("ollama", "Installing Ollama…");

        const onData = (d) => {
          const text = d.toString().trim();
          if (!text) return;
          console.log("[setup][ollama-install]", text);
          const match = text.match(/(\d+(?:\.\d+)?)%/);
          if (match) {
            const pct = parseFloat(match[1]);
            setupProgress(5 + Math.round(pct * 0.23));
            setupStepProgress("ollama", pct);
            setupStepStatus("ollama", `Downloading Ollama… ${Math.round(pct)}%`);
          }
        };
        proc.stdout.on("data", onData);
        proc.stderr.on("data", onData);
        proc.on("exit", (code) => {
          if (code === 0 || isOllamaInstalled()) resolve();
          else reject(new Error(`Ollama install exited with code ${code}`));
        });
        proc.on("error", reject);
      });
      setupLog("Ollama installed successfully.");
      setupStep("ollama", "done");
      setupProgress(30);
    } catch (err) {
      setupLog(`Error: ${err.message}`);
      setupStep("ollama", "error");
      setupLog("Could not install Ollama automatically.");
      setupLog("Please install it manually: https://ollama.com/download");
      setupDone();
      return;
    }
  }

  // Step 2: Start Ollama service
  setupStep("start", "active");
  const alreadyRunning = await isOllamaRunning();
  if (alreadyRunning) {
    setupLog("Ollama service is already running.");
  } else {
    setupLog("Starting Ollama service...");
    const serveProc = spawnOllamaServeDetached();
    serveProc.unref();

    let ready = false;
    for (let i = 0; i < 30; i++) {
      await delay(500);
      if (await isOllamaRunning()) {
        ready = true;
        break;
      }
    }
    if (!ready) setupLog("Warning: Ollama service did not start in time.");
    else setupLog("Ollama service started.");
  }
  setupStep("start", "done");
  setupProgress(50);

  // Step 3: Pull the AI model
  setupStep("model", "active");
  const modelReady = await isModelPulled();
  if (modelReady) {
    setupLog(`Model '${DEFAULT_SETUP_MODEL}' is already downloaded.`);
    setupStep("model", "done");
    setupProgress(85);
  } else {
    setupLog(`Downloading model '${DEFAULT_SETUP_MODEL}' (~4 GB, this may take several minutes)...`);
    try {
      await pullModel();
      setupLog(`Model '${DEFAULT_SETUP_MODEL}' downloaded successfully.`);
      setupStep("model", "done");
      setupProgress(85);
    } catch (err) {
      setupLog(`Error pulling model: ${err.message}`);
      setupStep("model", "error");
    }
  }

  } // end local Ollama setup

  // Step 4: OCR runtime (recommended; optional — install or skip)
  if (isTesseractInstalled()) {
    setupStepProgress("ocr", 100);
    setupStep("ocr", "done");
    setupStepStatus("ocr", "Tesseract OCR ready");
  } else {
    setupStep("ocr", "active");
    while (true) {
      const ocrResult = await installTesseract();
      if (ocrResult === "installed" || ocrResult === "skipped") break;
      setupLog("OCR install failed. Waiting for retry...");
      await waitForOcrRetry();
      setupStep("ocr", "active");
      setupStepStatus("ocr", "Retrying Tesseract OCR installation...");
    }
  }

  setupLog("Setup complete! Click Launch to open the app.");
  setupDone();
}

async function needsSetup() {
  if (isRemoteOllamaMode()) {
    return false;
  }
  // Ollama not installed → must run setup
  if (!isOllamaInstalled()) return true;
  // If Ollama is not running we cannot verify the model is pulled → force setup
  if (await isOllamaRunning()) {
    if (!(await isModelPulled())) return true;
  } else {
    return true; // Can't verify model; force setup to be safe
  }
  return false;
}

module.exports = {
  runSetup,
  needsSetup,
  getOcrCapabilities,
};
