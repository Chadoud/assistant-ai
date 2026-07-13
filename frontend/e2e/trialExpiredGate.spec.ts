import { test, expect } from "@playwright/test";
import {
  electronAPIStubTrialExpiredE2E,
  gotoSeededApp,
  openQueueTabShortcut,
  waitForAppShell,
} from "./helpers/appReady";

test.describe("Trial expired gate", () => {
  test("shows entitlement banner and blocks sorting", async ({ page }) => {
    test.setTimeout(90_000);

    await page.addInitScript(electronAPIStubTrialExpiredE2E);
    await gotoSeededApp(page, { stubElectron: false });
    await waitForAppShell(page);
    await openQueueTabShortcut(page);

    await expect(page.getByText(/Your free trial has ended/i)).toBeVisible({ timeout: 15_000 });

    // Entitlement gate disables local source selection, so the wizard can never
    // advance to Run sort — both the source toggle and Next stay disabled.
    await expect(
      page.getByLabel("Include local files when you press Run sort below")
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  });
});
