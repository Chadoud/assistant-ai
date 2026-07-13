import { test, expect } from "@playwright/test";
import { gotoSeededAppThenSettingsPrivacy } from "./helpers/appReady";

test.describe("Settings privacy", () => {
  test("Privacy section shows diagnostics disclosure", async ({ page }) => {
    await gotoSeededAppThenSettingsPrivacy(page);
    const privacy = page.locator("#settings-privacy");
    await privacy.scrollIntoViewIfNeeded();
    await expect(privacy).toBeVisible();
    await expect(privacy.getByText("Usage analytics", { exact: true })).toBeVisible();
    await expect(privacy.getByText("Crash reports", { exact: true })).toBeVisible();
    await expect(privacy.getByRole("button", { name: /erase local data/i })).toBeVisible();
  });
});
