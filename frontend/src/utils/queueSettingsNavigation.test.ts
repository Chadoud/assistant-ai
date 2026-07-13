import { describe, expect, it, vi } from "vitest";
import { createQueueSettingsNavigation, QUEUE_SETTINGS_SECTIONS } from "./queueSettingsNavigation";

describe("createQueueSettingsNavigation", () => {
  it("maps Sort-tab CTAs to the correct settings sections", () => {
    const jump = vi.fn();
    const nav = createQueueSettingsNavigation(jump);

    nav.onOpenOutputSettings();
    expect(jump).toHaveBeenCalledWith(QUEUE_SETTINGS_SECTIONS.outputFolder);

    nav.onOpenAccountSettings();
    expect(jump).toHaveBeenCalledWith(QUEUE_SETTINGS_SECTIONS.accountProfile);

    nav.onOpenSortModelSettings();
    expect(jump).toHaveBeenCalledWith(QUEUE_SETTINGS_SECTIONS.sortModels);

    nav.onOpenLicenseSettings();
    expect(jump).toHaveBeenCalledWith("settings-anchor-license");
  });
});
