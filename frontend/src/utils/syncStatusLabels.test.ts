import { describe, expect, it } from "vitest";
import { buildSyncStatusLines, totalNewFromCreated } from "./syncStatusLabels";

describe("buildSyncStatusLines", () => {
  const labels = {
    sourceLabel: (key: string) => key,
    statusNew: (n: number) => `${n} new`,
    statusNotConnected: "Not connected",
    statusUnavailable: "Temporarily unavailable",
  };

  it("returns empty when statuses missing", () => {
    expect(buildSyncStatusLines(undefined, {}, labels)).toEqual([]);
  });

  it("maps ok status with new count", () => {
    const lines = buildSyncStatusLines({ gmail: "ok" }, { gmail: 3 }, labels);
    expect(lines[0]?.message).toBe("gmail: 3 new");
    expect(lines[0]?.showConnect).toBe(false);
  });

  it("maps not_connected with connect flag", () => {
    const lines = buildSyncStatusLines({ outlook: "not_connected" }, {}, labels);
    expect(lines[0]?.message).toContain("Not connected");
    expect(lines[0]?.showConnect).toBe(true);
  });
});

describe("totalNewFromCreated", () => {
  it("sums created counts", () => {
    expect(totalNewFromCreated({ gmail: 2, outlook: 1 })).toBe(3);
  });
});
