import { describe, expect, it } from "vitest";
import { diagnosticsOnLegalAccept } from "./diagnosticsPreferences";

describe("diagnosticsPreferences", () => {
  it("always enables diagnostics on legal accept", () => {
    expect(diagnosticsOnLegalAccept()).toEqual({
      telemetryOptIn: true,
      crashReportsOptIn: true,
    });
  });
});
