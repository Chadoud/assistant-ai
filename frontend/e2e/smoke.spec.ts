import { test, expect } from "@playwright/test";
import { gotoSeededApp, gotoSeededAppThenSettingsSystem, waitForAppShell } from "./helpers/appReady";

test.describe("smoke", () => {
  test("loads Workspace tab shell", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoSeededApp(page);
    await waitForAppShell(page);
  });

  test("seeded session opens Settings via keyboard shortcut", async ({ page }) => {
    await gotoSeededAppThenSettingsSystem(page);
  });

  test("seeded session opens Help via F1 (same handler as title bar)", async ({ page }) => {
    await gotoSeededApp(page);
    await waitForAppShell(page);
    // Welcome / launch overlays can sit above the header; F1 matches `useCommandPaletteShortcuts` and still opens Help.
    await page.keyboard.press("F1");
    await expect(page.getByRole("heading", { name: "Help & shortcuts" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
