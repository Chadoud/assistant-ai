import { platform } from "node:os";
import { expect, type Page } from "@playwright/test";

/**
 * Playwright uses Chromium, not the packaged app — set a minimal `window.electronAPI` so
 * {@link hasElectronBridge} is true and desktop-only queue UI (e.g. **Run sort**) is mounted
 * the same as in the Electron build.
 */
export function electronAPIStubE2E(): void {
  const w = window as unknown as { electronAPI?: Record<string, unknown> };
  if (w.electronAPI) return;
  w.electronAPI = {
    getEntitlementState: async () => ({
      trialActive: true,
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trialDaysRemaining: 30,
      trialExpired: false,
      licensed: true,
      licenseReason: null,
      canAnalyze: true,
      canUseProactive: true,
      canUseSync: true,
      hasLicenseKey: false,
      cloudAuthRequired: false,
      cloudLoggedIn: false,
      cloudEmail: null,
    }),
    openPath: async () => undefined,
    openFiles: async () => [],
    openFilesOrFolders: async () => [],
    getDefaultOutputDir: async () => null,
    integrationListProviders: async () => ({
      providers: [
        { id: "google-gmail", oauthConfigured: false },
        { id: "google-drive", oauthConfigured: false },
        { id: "slack", oauthConfigured: false },
        { id: "whatsapp", oauthConfigured: false },
      ],
    }),
    integrationGetAccounts: async () => ({
      ok: true,
      accounts: [
        { providerId: "slack", connected: false },
        { providerId: "whatsapp", connected: false },
      ],
    }),
    integrationGetWhatsAppWebhookConfig: async () => ({
      ok: true,
      webhook_url: "https://api.exosites.ch/v1/webhooks/whatsapp",
      verify_token_hint: "Set WHATSAPP_VERIFY_TOKEN on the cloud API",
    }),
    integrationGetWhatsAppConnectConfig: async () => ({
      ok: true,
      embedded_signup_available: false,
    }),
    integrationGetWhatsAppBusinessStatus: async () => ({
      ok: true,
      connected: false,
    }),
    integrationSendWhatsAppTestMessage: async () => ({ ok: true, messageId: "wamid.test" }),
    integrationListWhatsAppMessageTemplates: async () => ({
      ok: true,
      templates: [{ name: "hello_world", language: "en_US", status: "APPROVED" }],
    }),
    integrationSaveWhatsAppCloudCredentials: async (payload) => {
      const phoneNumberId =
        typeof payload?.phone_number_id === "string" ? payload.phone_number_id.trim() : "";
      const accessToken =
        typeof payload?.access_token === "string" ? payload.access_token.trim() : "";
      const businessAccountId =
        typeof payload?.business_account_id === "string" ? payload.business_account_id.trim() : "";
      if (!phoneNumberId || !accessToken || !businessAccountId) {
        return { ok: false, reason: "missing_required_fields" };
      }
      return { ok: true, displayPhoneNumber: "+41791234567" };
    },
    openExternal: async () => undefined,
    // ADR-006: secrets live in main process — return test keys so chat/voice E2E can hydrate.
    getSecret: async (key: string) => {
      if (key === "geminiApiKey" || key === "chatProvider.gemini.apiKey") {
        // Must satisfy isGeminiKeyFormatPlausible (AIza + 30+ chars) or chat composer stays gated.
        return "AIzaSy0123456789012345678901234567890";
      }
      return null;
    },
    setSecret: async () => ({ ok: true }),
    // Called unconditionally on mount by connector cards on the External sources tab —
    // missing methods throw in useEffect and trip the global error boundary.
    integrationLoadInfomaniakApiToken: async () => ({ ok: true, hasToken: false }),
    integrationGetICloudFolder: async () => ({ ok: true, folder: null }),
    integrationListGoogleDriveFiles: async () => ({
      ok: true,
      files: [],
    }),
    restartBackend: async () => ({ ok: true }),
    getBackendStatus: async () => ({ ok: true }),
  };
}

/** Entitlement stub: signed-in user whose 30-day trial has ended — sort is gated. */
export function electronAPIStubTrialExpiredE2E(): void {
  const w = window as unknown as { electronAPI?: Record<string, unknown> };
  if (w.electronAPI) return;
  const endedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  w.electronAPI = {
    getEntitlementState: async () => ({
      trialActive: false,
      trialStartedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      trialEndsAt: endedAt,
      trialDaysRemaining: 0,
      trialExpired: true,
      licensed: false,
      licenseReason: null,
      canAnalyze: false,
      canUseProactive: false,
      canUseSync: false,
      hasLicenseKey: false,
      cloudAuthRequired: false,
      cloudLoggedIn: true,
      cloudEmail: "trial-expired@example.com",
    }),
    openPath: async () => undefined,
    openFiles: async () => [],
    openFilesOrFolders: async () => [],
    getDefaultOutputDir: async () => null,
    integrationListProviders: async () => ({
      providers: [
        { id: "google-gmail", oauthConfigured: false },
        { id: "google-drive", oauthConfigured: false },
      ],
    }),
    integrationGetAccounts: async () => ({ ok: true, accounts: [] }),
    integrationLoadInfomaniakApiToken: async () => ({ ok: true, hasToken: false }),
    integrationGetICloudFolder: async () => ({ ok: true, folder: null }),
    integrationListGoogleDriveFiles: async () => ({
      ok: true,
      files: [],
    }),
    restartBackend: async () => ({ ok: true }),
  };
}

/**
 * Minimal `electronAPI` (active trial + license) whose file picker returns `filePaths`,
 * so specs can stage local files into the workspace without a real OS dialog.
 * Install with `page.addInitScript(electronAPIStubWithLocalFilesE2E, filePaths)` before `goto`.
 */
export function electronAPIStubWithLocalFilesE2E(filePaths: string[]): void {
  const w = window as unknown as { electronAPI?: Record<string, unknown> };
  if (w.electronAPI) return;
  w.electronAPI = {
    getEntitlementState: async () => ({
      trialActive: true,
      trialStartedAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trialDaysRemaining: 30,
      trialExpired: false,
      licensed: true,
      licenseReason: null,
      canAnalyze: true,
      canUseProactive: true,
      canUseSync: true,
      hasLicenseKey: false,
      cloudAuthRequired: false,
      cloudLoggedIn: false,
      cloudEmail: null,
    }),
    openPath: async () => undefined,
    openFiles: async () => filePaths,
    openFilesOrFolders: async () => filePaths,
    getDefaultOutputDir: async () => null,
    integrationListProviders: async () => ({ providers: [] }),
    integrationGetAccounts: async () => ({ ok: true, accounts: [] }),
    integrationLoadInfomaniakApiToken: async () => ({ ok: true, hasToken: false }),
    integrationGetICloudFolder: async () => ({ ok: true, folder: null }),
    integrationListGoogleDriveFiles: async () => ({ ok: true, files: [] }),
    restartBackend: async () => ({ ok: true }),
    getBackendStatus: async () => ({ ok: true }),
    getSecret: async () => null,
    setSecret: async () => ({ ok: true }),
  };
}

const TOUR_COMPLETED_STORAGE_KEY = "exosites.tour.v2";

/** Keep in sync with `DEFAULT_API_BASE` in `src/constants.ts`. */
const E2E_API_ORIGIN = "http://127.0.0.1:7799";

/**
 * Baseline backend mock — Playwright (local and CI) runs without the Python backend,
 * and a failing `/health` poll puts the app behind the blocking "Service unavailable"
 * screen. Answers just enough for the shell to mount; everything else 404s.
 */
async function mockBackendBaselineE2E(page: Page): Promise<void> {
  await page.route(`${E2E_API_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
      return;
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    switch (url.pathname) {
      case "/health":
        await json({ status: "ok" });
        return;
      case "/models":
        await json({ models: ["llama3.2", "llava"] });
        return;
      case "/history":
        await json({ entries: [] });
        return;
      case "/folder-tree":
        await json({ tree: [] });
        return;
      case "/brain/files":
        await json({
          folders: [
            {
              folder_name: "Invoices",
              file_count: 1,
              profile: "finance",
              keywords: ["invoice"],
              updated_at: Date.now() / 1000,
              files: [
                {
                  path: "/tmp/e2e-output/Invoices/a.pdf",
                  name: "a.pdf",
                  excerpt: "E2E fixture",
                  updated_at: Date.now() / 1000,
                },
              ],
            },
          ],
          folder_count: 1,
          file_count: 1,
        });
        return;
      case "/conversations":
        await json([]);
        return;
      case "/memory":
        await json([]);
        return;
      case "/tasks":
        await json([]);
        return;
      default:
        await json({}, 404);
    }
  });
}

/**
 * Minimal settings + tour done so the welcome wizard and cloud gate do not block the UI.
 * Prefer {@link gotoSeededApp} for specs; or call `addInitScript(seedAppReadyStorage)` before `goto("/")`.
 *
 * MUST stay self-contained: Playwright serializes this function into the page, so module-level
 * constants are not in scope there — referencing them aborts the seed with a ReferenceError.
 * Storage keys mirror `src/constants.ts`; the legal version mirrors `LEGAL_TERMS_BUNDLE_VERSION`.
 */
export function seedAppReadyStorage(): void {
  sessionStorage.setItem("__exositesDevScenario", "e2e");
  // Skip the Exo intro animation and the assistant-actions consent modal —
  // both block clicks/visibility on the main shell during specs.
  sessionStorage.setItem("exo_panel_intro_done", "1");
  sessionStorage.setItem("exosites.assistant.permissionModal.dismissed.v1", "1");
  localStorage.setItem("exosites.welcomeSetup.dismissed.v1", "1");
  localStorage.setItem(
    "exosites.settings.v1",
    JSON.stringify({
      model: "llama3.2",
      outputDir: "/tmp/e2e-output",
      uiLocale: "en",
      mode: "copy",
      language: "English",
      folderViewMode: "rows",
      visionModel: "",
      rules: [],
      onCollision: "uniquify",
      minConfidence: 0.1,
      automationPreset: "custom",
      ocrLanguages: [],
      telemetryOptIn: true,
      crashReportsOptIn: true,
      diagnosticsOptOutExplicit: false,
      acceptedLegalTermsVersion: "2026-06-25-gdpr-li",
      sortSystemPrompt: "",
    })
  );
  localStorage.setItem("exosites.tour.v2", "1");
}

/** `addInitScript` + `goto("/")` — call before asserting on the main shell. */
export type GotoSeededAppOptions = {
  /** Default true — minimal `window.electronAPI` so **Run sort** and Drive/Gmail blocks mount in Chromium. */
  stubElectron?: boolean;
  /** Default true — set `false` when the spec installs its own `page.route` API mock (later routes win). */
  mockBackend?: boolean;
};

/**
 * @param options.stubElectron - Set to `false` to debug; most queue specs need the stub to match the desktop surface.
 * @param options.mockBackend  - Set to `false` when the spec registers its own API routes.
 */
export async function gotoSeededApp(
  page: Page,
  options: GotoSeededAppOptions = {}
): Promise<void> {
  if (options.stubElectron !== false) {
    await page.addInitScript(electronAPIStubE2E);
  }
  if (options.mockBackend !== false) {
    await mockBackendBaselineE2E(page);
  }
  await page.addInitScript(seedAppReadyStorage);
  await page.goto("/");
  // Some Chromium builds throw on `localStorage` access at document-start, which
  // silently aborts the init-script seed (sessionStorage line runs, localStorage
  // lines do not). Detect that, re-seed in the live document, and reload so the
  // app hydrates from the intended state.
  const seedApplied = await page.evaluate(
    (tourKey: string) => localStorage.getItem(tourKey) === "1",
    TOUR_COMPLETED_STORAGE_KEY
  );
  if (!seedApplied) {
    await page.evaluate(seedAppReadyStorage);
    await page.goto("/");
  }
}

/**
 * Wait for the main app shell (sidebar navigation) — tab shortcuts mount in the
 * same tree, so they are safe to dispatch afterwards. The default tab is the
 * Exo assistant panel; `[data-tour="assistant-workspace"]` only exists on the
 * separate Assistant tab, so do NOT use it as a readiness marker.
 */
export async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.getByRole("navigation")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Sort files" })).toBeVisible({ timeout: 15_000 });
}

/**
 * Open the workspace, stage the seeded local fixtures via the picker stub, and enable
 * "Include local files" so the pre-sort wizard has a source and can advance past Sources.
 * Requires {@link electronAPIStubWithLocalFilesE2E} to be installed before `goto`.
 */
export async function stageWorkspaceLocalFiles(page: Page, firstFileName: string): Promise<void> {
  await page.getByRole("button", { name: "Sort files" }).click();
  await expect(page.locator('[data-tour="queue-panel-intro"]')).toBeVisible({ timeout: 60_000 });
  await page.locator("#workspace-local-toggle").click();
  await page.locator('#workspace-local-panel [data-tour="drop-zone"]').click();
  await expect(page.getByText(firstFileName)).toBeVisible();
  await page.getByLabel("Include local files when you press Run sort below").check();
}

/**
 * Advance the pre-sort wizard `steps` times via the Next button (Sources → Structure → Review).
 * A source must be selected first (see {@link stageWorkspaceLocalFiles}) or Next stays disabled.
 */
export async function advanceSortWizard(page: Page, steps = 1): Promise<void> {
  const next = page.getByRole("button", { name: "Next", exact: true });
  for (let i = 0; i < steps; i += 1) {
    await expect(next).toBeEnabled();
    await next.click();
  }
}

/**
 * Full flow used by most Settings E2E: seed, load app, wait for main shell, ⌘/Ctrl+7, wait for Settings.
 */
export async function waitForSettingsPanel(page: Page): Promise<void> {
  await expect(page.locator('[data-settings-nav-id="settings-anchor-models"]').first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openSettingsSectionViaSearch(page: Page, query: string, navId: string): Promise<void> {
  const search = page.getByRole("searchbox", { name: /search settings/i });
  await search.fill(query);
  await page.locator(`[data-settings-nav-id="${navId}"]`).click();
}

export async function openSettingsTabShortcut(page: Page): Promise<void> {
  await dispatchModDigitShortcut(page, "7", "Digit7");
}

export async function gotoSeededAppThenSettings(page: Page): Promise<void> {
  await gotoSeededApp(page);
  await waitForAppShell(page);
  await openSettingsTabShortcut(page);
  await waitForSettingsPanel(page);
}

/** Privacy & diagnostics block on the Privacy & account settings sub-tab. */
export async function gotoSeededAppThenSettingsPrivacy(page: Page): Promise<void> {
  await gotoSeededAppThenSettings(page);
  const search = page.getByRole("searchbox", { name: /search settings/i });
  await search.fill("Privacy");
  await page.locator('[data-settings-nav-id="settings-anchor-privacy"]').click();
  // Clear search so the panel returns to single-tab mode and keeps privacy content mounted.
  await search.fill("");
  await expect(page.locator("#settings-anchor-privacy")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#settings-privacy")).toBeVisible({ timeout: 15_000 });
}

/** App status on the About & help settings sub-tab. */
export async function gotoSeededAppThenSettingsSystem(page: Page): Promise<void> {
  await gotoSeededAppThenSettings(page);
  await openSettingsSectionViaSearch(page, "App status", "settings-anchor-system");
  await expect(page.locator("#settings-anchor-system")).toBeVisible({ timeout: 15_000 });
}

// Digits MUST match MOD_TAB_ORDER in `src/hooks/useCommandPaletteShortcuts.ts`:
// 1 exo · 2 assistant · 3 queue · 4 overview · 5 history · 6 sources · 7 settings.

/** Sort / Workspace tab (⌘/Ctrl+3 in `useCommandPaletteShortcuts`). */
export async function openQueueTabShortcut(page: Page): Promise<void> {
  await dispatchModDigitShortcut(page, "3", "Digit3");
}

/** External sources is the sixth tab (⌘/Ctrl+6). */
export async function openSourcesTabShortcut(page: Page): Promise<void> {
  await dispatchModDigitShortcut(page, "6", "Digit6");
}

async function dispatchModDigitShortcut(page: Page, key: string, code: string): Promise<void> {
  const useMeta = platform() === "darwin";
  await page.evaluate(
    ({ meta, k, c }: { meta: boolean; k: string; c: string }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: k,
          code: c,
          metaKey: meta,
          ctrlKey: !meta,
          bubbles: true,
          cancelable: true,
        })
      );
    },
    { meta: useMeta, k: key, c: code }
  );
}
