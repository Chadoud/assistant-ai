import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "../api";
import {
  accountAvatarInitials,
  accountDisplayLabel,
  accountFullName,
  accountProfileTitle,
} from "./accountProfileDisplay";

const base: EntitlementStatus = {
  trialActive: true,
  trialStartedAt: null,
  trialEndsAt: null,
  trialDaysRemaining: 7,
  trialExpired: false,
  licensed: false,
  licenseReason: null,
  canAnalyze: true,
  canUseProactive: true,
  canUseSync: true,
  hasLicenseKey: false,
  cloudAuthRequired: true,
  cloudLoggedIn: true,
  cloudEmail: "alex@example.com",
};

describe("accountProfileDisplay", () => {
  it("builds full name and initials from first and last name", () => {
    const entitlement = { ...base, cloudFirstName: "Alex", cloudLastName: "Martin" };
    expect(accountFullName(entitlement)).toBe("Alex Martin");
    expect(accountDisplayLabel(entitlement)).toBe("Alex Martin");
    expect(accountAvatarInitials(entitlement)).toBe("AM");
    expect(accountProfileTitle(entitlement)).toBe("Alex Martin · alex@example.com");
  });

  it("falls back to email when names are missing", () => {
    expect(accountDisplayLabel(base)).toBe("alex@example.com");
    expect(accountAvatarInitials(base)).toBe("A");
    expect(accountProfileTitle(base)).toBe("alex@example.com");
  });
});
