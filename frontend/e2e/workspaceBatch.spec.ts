import { test, expect } from "@playwright/test";
import { gotoSeededApp, openQueueTabShortcut, waitForAppShell } from "./helpers/appReady";

test.describe("Workspace batch", () => {
  test("cannot reach Run sort without a source selected", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoSeededApp(page);
    // Shortcut listeners mount with the main shell — dispatching earlier is a no-op.
    await waitForAppShell(page);
    await openQueueTabShortcut(page);
    await expect(page.locator('[data-tour="queue-panel-intro"]')).toBeVisible({ timeout: 60_000 });

    // The pre-sort wizard opens on Sources. With nothing selected the user cannot
    // advance to the Review step, so the Run sort button is never rendered.
    await expect(page.getByTestId("sort-wizard")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await expect(page.getByTestId("workspace-run-sort")).toHaveCount(0);
  });
});
