import { test, expect } from "@playwright/test";
import { gotoSeededApp, waitForAppShell } from "./helpers/appReady";

test.describe("brain map", () => {
  test("memory map tab shows hub controls and filters", async ({ page }) => {
    await gotoSeededApp(page);
    await waitForAppShell(page);
    await page.locator('[data-tour="nav-memories"]').click();
    await page.getByRole("button", { name: /map/i }).click();
    const mapPanel = page.getByRole("main");
    await expect(mapPanel.getByRole("button", { name: /hubs/i })).toBeVisible({ timeout: 20_000 });
    await expect(mapPanel.getByRole("button", { name: /show all/i })).toBeVisible();
    await expect(mapPanel.getByRole("button", { name: /^file$/i })).toBeVisible();
    await expect(mapPanel.getByRole("button", { name: /^memory$/i })).toBeVisible();
  });
});
