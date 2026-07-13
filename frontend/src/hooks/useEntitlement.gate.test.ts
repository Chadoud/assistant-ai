import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "../api";
import { computeNeedsCloudAccount } from "./useEntitlement";

const loggedOut: EntitlementStatus = {
  trialActive: false,
  trialStartedAt: null,
  trialEndsAt: null,
  trialDaysRemaining: 0,
  trialExpired: true,
  licensed: false,
  licenseReason: null,
  canAnalyze: false,
  canUseProactive: false,
  hasLicenseKey: false,
  cloudAuthRequired: true,
  cloudLoggedIn: false,
  cloudEmail: null,
};

describe("computeNeedsCloudAccount", () => {
  it("requires gate when cloud auth is on and user is logged out", () => {
    expect(computeNeedsCloudAccount(true, loggedOut, true, true)).toBe(true);
  });

  it("skips gate when logged in", () => {
    expect(
      computeNeedsCloudAccount(true, { ...loggedOut, cloudLoggedIn: true }, true, true)
    ).toBe(false);
  });

  it("keeps gate on when Electron preload is missing", () => {
    expect(computeNeedsCloudAccount(true, null, false, true)).toBe(true);
  });
});
