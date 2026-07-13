/**
 * Shared mutable state for the Electron main process.
 * All modules import this object and mutate properties directly —
 * this avoids circular dependencies while keeping window references accessible.
 */
const state = {
  /** @type {import('electron').BrowserWindow | null} */
  mainWindow: null,

  /** @type {import('electron').BrowserWindow | null} */
  setupWindow: null,

  /** @type {import('child_process').ChildProcess | null} */
  backendProcess: null,

  /** Epoch ms when the current backend child was spawned (packaged cold start timeout). */
  backendSpawnedAt: 0,

  /** Stop auto-respawn until explicit restartBackend() after repeated failures. */
  backendStartupGiveUp: false,

  /** Non-zero exit streak for crash-loop detection (e.g. EBADARCH on wrong CPU arch). */
  backendCrashCount: 0,

  /** Epoch ms of the most recent non-zero backend exit. */
  backendLastCrashAt: 0,

  /** Dev: pip sync runs once per app session — respawns must not reinstall on every restart. */
  backendDepsEnsured: false,

  /** @type {((accepted: boolean) => void) | null} */
  _ocrConfirmResolve: null,

  /** @type {(() => void) | null} */
  _ocrRetryResolve: null,

  /** True while a real app quit is in progress (Cmd+Q, tray Quit, etc.). */
  isAppQuitting: false,

  /**
   * When true (clap-to-launch enabled), closing the main window hides it to the tray
   * instead of quitting, so the renderer keeps listening for a double-clap to re-open it.
   */
  clapToLaunchMode: false,

  /**
   * Per-run shared secret passed to the Python backend as EXOSITES_APP_TOKEN.
   * The frontend reads it via IPC and includes it as X-App-Token on every API request,
   * so other local processes cannot call the backend.
   * @type {string | null}
   */
  appToken: null,

  /** Active codegen session id for preview tab (renderer hint). */
  activeCodegenSessionId: null,

  /**
   * Epoch ms until which a user-granted screen-capture consent is valid.
   * Set by `capture:grantConsent` on an explicit user gesture and cleared after
   * a single `capture:screen`. 0 means no active consent.
   */
  screenCaptureConsentUntil: 0,
};

module.exports = state;
