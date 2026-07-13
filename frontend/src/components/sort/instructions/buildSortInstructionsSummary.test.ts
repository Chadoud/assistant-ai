import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../../settings/appSettingsHydration";
import { buildSortInstructionsSummary } from "./buildSortInstructionsSummary";

const t = (key: string, vars?: Record<string, string | number>) => {
  if (vars?.count != null && key.includes("summaryRules")) return `${vars.count} rules`;
  if (key.includes("summaryBuiltin")) return "AI chooses folders automatically";
  if (key.includes("summaryCustom")) return "Using your written instructions";
  if (key.includes("summaryStructure")) return "Custom folder path (not finished yet)";
  if (key.includes("summarySingle")) return `Files sorted by ${vars?.level}`;
  return key;
};

describe("buildSortInstructionsSummary", () => {
  it("shows builtin when mode is builtin", () => {
    const summary = buildSortInstructionsSummary(
      { ...DEFAULT_APP_SETTINGS, sortClassifyMode: "builtin" },
      t
    );
    expect(summary).toBe("AI chooses folders automatically");
  });

  it("shows custom when mode is custom", () => {
    const summary = buildSortInstructionsSummary(
      { ...DEFAULT_APP_SETTINGS, sortClassifyMode: "custom", sortSystemPrompt: "x" },
      t
    );
    expect(summary).toBe("Using your written instructions");
  });

  it("appends active rules count", () => {
    const summary = buildSortInstructionsSummary(
      {
        ...DEFAULT_APP_SETTINGS,
        sortClassifyMode: "builtin",
        rules: [
          { id: "1", enabled: true, priority: 0, pattern: "*.pdf", action: "skip" },
          { id: "2", enabled: false, priority: 0, pattern: "*.jpg", action: "skip" },
        ],
      },
      t
    );
    expect(summary).toBe("AI chooses folders automatically · 1 rules");
  });
});
