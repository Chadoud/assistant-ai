import { test } from "@playwright/test";
import { gotoSeededAppThenSettings } from "./helpers/appReady";

test.describe("navigation", () => {
  test("navigates to Settings tab", async ({ page }) => {
    await gotoSeededAppThenSettings(page);
  });
});
