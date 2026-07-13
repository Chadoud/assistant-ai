import { describe, expect, it } from "vitest";
import { shouldShowSidebarCornerBranding } from "./sidebarCornerBranding";

describe("shouldShowSidebarCornerBranding", () => {
  const desktop = { isDesktopElectron: true };
  const browser = { isDesktopElectron: false };

  it("hides during Exo intro landing", () => {
    expect(shouldShowSidebarCornerBranding("exo", false, desktop)).toBe(false);
  });

  it("shows clock corner after Exo intro reveals", () => {
    expect(shouldShowSidebarCornerBranding("exo", true, desktop)).toBe(true);
  });

  it("shows clock corner on non-Exo tabs even before intro completes", () => {
    expect(shouldShowSidebarCornerBranding("queue", false, desktop)).toBe(true);
  });

  it("is off in browser builds", () => {
    expect(shouldShowSidebarCornerBranding("queue", true, browser)).toBe(false);
  });
});
