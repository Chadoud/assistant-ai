import { test, expect, type Page } from "@playwright/test";
import { electronAPIStubE2E, seedAppReadyStorage, waitForAppShell } from "./helpers/appReady";

/** Keep in sync with `E2E_API_ORIGIN` in `helpers/appReady.ts`. */
const E2E_API_ORIGIN = "http://127.0.0.1:7799";

const VOICE_STATUS_READY = { ready: true, model: "gemini-2.5-flash" };

/**
 * Voice-ready backend mock — baseline `/health` plus `/voice/status` so Exo does not
 * show a false "missing API key" banner when the backend is actually configured.
 */
async function mockVoiceReadyBackend(page: Page): Promise<void> {
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
      case "/voice/status":
        await json(VOICE_STATUS_READY);
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
      default:
        await json({}, 404);
    }
  });
}

/** Runs after `seedAppReadyStorage` — must stay self-contained for Playwright serialization. */
function applyVoiceE2ESettings(mode: "conversation" | "pushToTalk"): void {
  const key = "exosites.settings.v1";
  try {
    const raw = localStorage.getItem(key);
    const base = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(
      key,
      JSON.stringify({
        ...base,
        geminiApiKey: "AIzaSyE2E-test-key-not-real",
        chatProviders: {
          gemini: { apiKey: "AIzaSyE2E-test-key-not-real", model: "gemini-2.5-flash" },
        },
        voiceAutoStart: false,
        voiceInteractionMode: mode,
      }),
    );
  } catch {
    /* ignore */
  }
}

async function gotoExoVoiceReady(page: Page, voiceInteractionMode: "conversation" | "pushToTalk") {
  await mockVoiceReadyBackend(page);
  await page.addInitScript(electronAPIStubE2E);
  await page.addInitScript(seedAppReadyStorage);
  await page.addInitScript(applyVoiceE2ESettings, voiceInteractionMode);
  await page.goto("/");
  const seedApplied = await page.evaluate(
    (tourKey: string) => localStorage.getItem(tourKey) === "1",
    "exosites.tour.v2",
  );
  if (!seedApplied) {
    await page.evaluate(seedAppReadyStorage);
    await page.evaluate(applyVoiceE2ESettings, voiceInteractionMode);
    await page.goto("/");
  }
  await waitForAppShell(page);
}

test.describe("voice PTT smoke", () => {
  test("conversation mode Exo tab shows no false API key error", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoExoVoiceReady(page, "conversation");

    await expect(page.locator(".exo-voice-error")).toHaveCount(0);
    await expect(page.getByText(/api key not valid/i)).toHaveCount(0);
    await expect(page.getByText(/gemini api key is missing/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /MIC \[F4\]/i })).toBeVisible();
  });

  test("push-to-talk mode Exo tab shows PTT hint without API key error", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoExoVoiceReady(page, "pushToTalk");

    await expect(page.locator(".exo-voice-error")).toHaveCount(0);
    await expect(page.getByText(/api key not valid/i)).toHaveCount(0);
    await expect(page.getByText(/gemini api key is missing/i)).toHaveCount(0);
    await expect(page.getByText(/Hold .+ to speak/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /MIC \[F4\]/i })).toHaveCount(0);
  });
});
