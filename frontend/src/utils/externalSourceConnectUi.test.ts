import { describe, expect, it } from "vitest";
import { externalSourceConnectDisabled, describeIntegrationConnectFailure } from "./externalSourceConnectUi";

const t = (key: string) => key;

describe("externalSourceConnectDisabled", () => {
  it("allows connect when oauth is not configured on desktop", () => {
    expect(
      externalSourceConnectDisabled({
        connected: false,
        desktop: true,
      }),
    ).toBe(false);
  });

  it("blocks only while loading or busy", () => {
    expect(externalSourceConnectDisabled({ connected: false, loading: true })).toBe(true);
    expect(externalSourceConnectDisabled({ connected: false, busy: true })).toBe(true);
  });

  it("blocks web Gmail when backend is offline", () => {
    expect(
      externalSourceConnectDisabled({
        connected: false,
        desktop: false,
        backendOnline: false,
      }),
    ).toBe(true);
  });

  it("never blocks disconnect when connected", () => {
    expect(externalSourceConnectDisabled({ connected: true, loading: true })).toBe(true);
    expect(externalSourceConnectDisabled({ connected: true, loading: false })).toBe(false);
  });
});

describe("describeIntegrationConnectFailure", () => {
  it("maps oauth_not_configured", () => {
    expect(describeIntegrationConnectFailure(t, "oauth_not_configured")).toBe(
      "sources.connectorOauthNotConfigured",
    );
  });
});
