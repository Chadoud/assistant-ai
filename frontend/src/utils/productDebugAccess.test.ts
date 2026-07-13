import { describe, expect, it, beforeEach } from "vitest";
import {
  canUseProductDebug,
  isProductDebugEnabled,
  setProductDebugAccessCached,
  shouldShowAssistantDebugUi,
} from "./productDebugAccess";

describe("canUseProductDebug", () => {
  beforeEach(() => {
    setProductDebugAccessCached(false);
  });

  it("allows product admins in production builds", () => {
    expect(
      canUseProductDebug({
        trialActive: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: 7,
        trialExpired: false,
        licensed: false,
        licenseReason: null,
        canAnalyze: true,
        hasLicenseKey: false,
        isProductAdmin: true,
      }),
    ).toBe(true);
  });

  it("denies non-admin users in production builds", () => {
    expect(
      canUseProductDebug({
        trialActive: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: 7,
        trialExpired: false,
        licensed: false,
        licenseReason: null,
        canAnalyze: true,
        hasLicenseKey: false,
        isProductAdmin: false,
      }),
    ).toBe(import.meta.env.DEV);
  });

  it("reads cached admin flag for sync helpers", () => {
    setProductDebugAccessCached(true);
    expect(isProductDebugEnabled()).toBe(true);
  });
});

describe("shouldShowAssistantDebugUi", () => {
  it("hides when product debug is off", () => {
    expect(shouldShowAssistantDebugUi(false, true)).toBe(false);
  });

  it("respects dev-only assistant toggle when product debug is on", () => {
    if (!import.meta.env.DEV) return;
    expect(shouldShowAssistantDebugUi(true, true)).toBe(true);
    expect(shouldShowAssistantDebugUi(true, false)).toBe(false);
  });
});
