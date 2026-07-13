/** Electron process constants — single source of truth for main process. */

const { app } = require("electron");

// Must match `productName` in package.json and `AppName` in installer.iss.
const APP_NAME = require("../package.json").build?.productName ?? "Exo";
/** Keep in sync with `frontend/src/constants.ts` `BACKEND_PORT`. */
const BACKEND_PORT = 7799;
/** Loopback bridge for Python → Electron screen capture (macOS TCC under the app name). */
const ELECTRON_CAPTURE_PORT = 7798;
const OLLAMA_PORT = 11434;
const DEFAULT_SETUP_MODEL = "mistral";

const IS_DEV = process.env.NODE_ENV === "development" || !app?.isPackaged;
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// ── Timeout / retry values ─────────────────────────────────────────────────
const OLLAMA_TAGS_TIMEOUT_MS     = 2000;
const OLLAMA_PULL_TIMEOUT_MS     = 30 * 60 * 1000;
const OLLAMA_READY_POLL_MAX      = 30;
const POLL_INTERVAL_MS           = 500;
const TESSERACT_SPAWN_TIMEOUT_MS = 4000;
const BACKEND_HEALTH_RETRIES     = 20;
/** Packaged PyInstaller cold start — keep in sync with frontend `HEALTH_FAST_RETRIES_ELECTRON`. */
const BACKEND_PACKAGED_HEALTH_RETRIES = 480;
const BACKEND_PACKAGED_HEALTH_DELAY_MS = 500;
/** Stop respawning after this many non-zero exits until the user hits Restart service. */
const BACKEND_MAX_CRASHES_BEFORE_GIVE_UP = 3;

// ── Ollama URL helpers ─────────────────────────────────────────────────────
const OLLAMA_BASE_URL  = `http://127.0.0.1:${OLLAMA_PORT}`;
const OLLAMA_TAGS_PATH = "/api/tags";
const OLLAMA_PULL_PATH = "/api/pull";

const DIALOG_FILE_FILTERS = [
  { name: "All Files", extensions: ["*"] },
  { name: "Documents", extensions: ["pdf", "docx", "doc", "txt", "md"] },
  { name: "Spreadsheets", extensions: ["xlsx", "xls", "csv"] },
  { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"] },
];

module.exports = {
  APP_NAME,
  BACKEND_PORT,
  ELECTRON_CAPTURE_PORT,
  OLLAMA_PORT,
  DEFAULT_SETUP_MODEL,
  IS_DEV,
  IS_WIN,
  IS_MAC,
  OLLAMA_TAGS_TIMEOUT_MS,
  OLLAMA_PULL_TIMEOUT_MS,
  OLLAMA_READY_POLL_MAX,
  POLL_INTERVAL_MS,
  TESSERACT_SPAWN_TIMEOUT_MS,
  BACKEND_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_DELAY_MS,
  BACKEND_MAX_CRASHES_BEFORE_GIVE_UP,
  OLLAMA_BASE_URL,
  OLLAMA_TAGS_PATH,
  OLLAMA_PULL_PATH,
  DIALOG_FILE_FILTERS,
};
