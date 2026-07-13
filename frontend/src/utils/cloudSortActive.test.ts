import { describe, expect, it } from "vitest";
import { computeCloudSortActive } from "./cloudSortActive";

describe("computeCloudSortActive", () => {
  it("returns cloud when entitlement reports cloud sort", () => {
    const result = computeCloudSortActive({
      entitlement: {
        trialActive: true,
        trialStartedAt: null,
        trialEndsAt: null,
        trialDaysRemaining: 14,
        trialExpired: false,
        licensed: false,
        licenseReason: null,
        canAnalyze: true,
        hasLicenseKey: false,
        sortServiceMode: "cloud",
        sortCredentialsManaged: true,
      },
      remoteFromOverrides: false,
      overridesLoading: false,
    });
    expect(result.cloudSortActive).toBe(true);
    expect(result.credentialsManaged).toBe(true);
  });

  it("returns cloud from overrides when remote and not loading", () => {
    const result = computeCloudSortActive({
      entitlement: null,
      remoteFromOverrides: true,
      overridesLoading: false,
    });
    expect(result.cloudSortActive).toBe(true);
  });

  it("returns cloud for signed-in subscriber on desktop app", () => {
    const result = computeCloudSortActive({
      entitlement: {
        cloudAuthRequired: true,
        cloudLoggedIn: true,
        canAnalyze: true,
        sortServiceMode: "local",
      } as never,
      remoteFromOverrides: false,
      overridesLoading: false,
      desktopApp: true,
    });
    expect(result.cloudSortActive).toBe(true);
  });

  it("returns local for signed-in subscriber in browser dev without remote overrides", () => {
    const result = computeCloudSortActive({
      entitlement: {
        cloudAuthRequired: true,
        cloudLoggedIn: true,
        canAnalyze: true,
        sortServiceMode: "local",
      } as never,
      remoteFromOverrides: false,
      overridesLoading: false,
      desktopApp: false,
    });
    expect(result.cloudSortActive).toBe(false);
  });

  it("returns local when neither source indicates cloud", () => {
    const result = computeCloudSortActive({
      entitlement: { sortServiceMode: "local" } as never,
      remoteFromOverrides: false,
      overridesLoading: false,
    });
    expect(result.cloudSortActive).toBe(false);
  });
});
