import { test, expect, type Page, type Route } from "@playwright/test";
import { advanceSortWizard, gotoSeededApp } from "./helpers/appReady";

/**
 * Classify → review → apply happy path against a mocked backend.
 *
 * CI runs Playwright without the Python backend, so every `127.0.0.1:7799`
 * call is fulfilled at the network layer with schema-valid fixtures. The test
 * drives the real UI: stage local files, Run sort, review suggestions, Apply,
 * and verify the run-complete card.
 */

const API_ORIGIN = "http://127.0.0.1:7799";
const JOB_ID = "job-e2e-happy";
const SESSION_ID = "session-e2e-happy";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const STAGED_FILES = [
  {
    path: "/tmp/e2e-in/invoice-acme-2026.pdf",
    name: "invoice-acme-2026.pdf",
    folder: "Invoices",
    reason: "Invoice from ACME for March 2026",
  },
  {
    path: "/tmp/e2e-in/passport-scan.jpg",
    name: "passport-scan.jpg",
    folder: "Identity documents",
    reason: "Scanned passport photo page",
  },
];

function reviewReadyJob() {
  return {
    id: JOB_ID,
    session_id: SESSION_ID,
    phase: "awaiting_approval",
    status: "awaiting_approval",
    total: STAGED_FILES.length,
    completed: STAGED_FILES.length,
    last_processed_index: STAGED_FILES.length - 1,
    pause_requested: false,
    cancel_requested: false,
    error: null,
    files: STAGED_FILES.map((f) => ({
      path: f.path,
      name: f.name,
      status: "review_ready",
      suggested_folder: f.folder,
      final_folder: null,
      confidence: 0.93,
      reason: f.reason,
      approved: true,
      dest_path: null,
      error: null,
      entry_id: null,
    })),
  };
}

function doneJob() {
  return {
    ...reviewReadyJob(),
    phase: "done",
    status: "done",
    files: STAGED_FILES.map((f, i) => ({
      path: f.path,
      name: f.name,
      status: "done",
      suggested_folder: f.folder,
      final_folder: f.folder,
      confidence: 0.93,
      reason: f.reason,
      approved: true,
      dest_path: `/tmp/e2e-output/${f.folder}/${f.name}`,
      error: null,
      entry_id: `entry-${i + 1}`,
    })),
  };
}

type AppliedItem = { path: string; approved: boolean; folder?: string };

/** Mutable mock-backend state shared between route handler and assertions. */
type MockBackendState = {
  analyzeStarted: boolean;
  appliedItems: AppliedItem[] | null;
};

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function mockSortBackend(page: Page, state: MockBackendState): Promise<void> {
  await page.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    if (path === "/health") {
      await fulfillJson(route, { status: "ok" });
      return;
    }
    if (path === "/models") {
      // llava closes the vision-model gap so Run sort is not blocked.
      await fulfillJson(route, { models: ["llama3.2", "llava"] });
      return;
    }
    if (path === "/analyze" && method === "POST") {
      state.analyzeStarted = true;
      await fulfillJson(route, { job_id: JOB_ID, session_id: SESSION_ID });
      return;
    }
    if (path === `/job/${JOB_ID}`) {
      await fulfillJson(route, state.appliedItems ? doneJob() : reviewReadyJob());
      return;
    }
    if (path === "/apply" && method === "POST") {
      const body = request.postDataJSON() as { job_id: string; items: AppliedItem[] };
      state.appliedItems = body.items;
      await fulfillJson(route, { job_id: JOB_ID });
      return;
    }
    if (path === "/folder-tree" && method === "POST") {
      await fulfillJson(route, { tree: [] });
      return;
    }
    if (path === "/history") {
      await fulfillJson(route, { entries: [] });
      return;
    }
    // Anything else (voice, vision status, telemetry…) is irrelevant here.
    await route.fulfill({ status: 404, headers: CORS_HEADERS, body: "{}" });
  });
}

/**
 * Same shape as `electronAPIStubE2E`, plus a file picker that returns staged
 * absolute paths so the local workspace card can be filled without a real OS dialog.
 */
function electronAPIStubWithLocalFiles(filePaths: string[]): void {
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
    integrationGetAccounts: async () => ({ accounts: [] }),
    restartBackend: async () => ({ ok: true }),
  };
}

test.describe("Sort happy path (mocked backend)", () => {
  test("classify → review → apply moves every approved file", async ({ page }) => {
    test.setTimeout(120_000);

    const state: MockBackendState = { analyzeStarted: false, appliedItems: null };
    await mockSortBackend(page, state);
    await page.addInitScript(
      electronAPIStubWithLocalFiles,
      STAGED_FILES.map((f) => f.path)
    );
    await gotoSeededApp(page, { stubElectron: false, mockBackend: false });
    await page.getByRole("button", { name: "Sort files" }).click();
    await expect(page.locator('[data-tour="queue-panel-intro"]')).toBeVisible({ timeout: 60_000 });

    // Stage local files via the workspace card (picker stub returns the fixture paths).
    await page.locator("#workspace-local-toggle").click();
    await page.locator('#workspace-local-panel [data-tour="drop-zone"]').click();
    await expect(page.getByText(STAGED_FILES[0].name)).toBeVisible();

    await page.getByLabel("Include local files when you press Run sort below").check();

    // Run sort lives on the wizard's Review step: Sources → Structure → Review.
    await advanceSortWizard(page, 2);
    const runSort = page.getByTestId("workspace-run-sort");
    await expect(runSort).toBeEnabled({ timeout: 15_000 });
    await runSort.click();

    // Classification finished server-side — the review panel lists both suggestions.
    await expect(page.getByText("need your review")).toBeVisible({ timeout: 30_000 });
    expect(state.analyzeStarted).toBe(true);
    await expect(page.getByText(STAGED_FILES[0].folder).first()).toBeVisible();
    await expect(page.getByText(STAGED_FILES[1].folder).first()).toBeVisible();

    await page.getByRole("button", { name: "Apply approved" }).click();

    // Post-run card confirms the apply pass; the mock flipped the job to done.
    await expect(page.getByText("Run complete")).toBeVisible({ timeout: 30_000 });
    expect(state.appliedItems).not.toBeNull();
    expect(state.appliedItems).toHaveLength(STAGED_FILES.length);
    for (const item of state.appliedItems ?? []) {
      expect(item.approved).toBe(true);
    }
  });
});
