import { describe, expect, it } from "vitest";
import { shortReviewReasonLabel } from "./formatReviewReason";

describe("shortReviewReasonLabel", () => {
  it("compresses mention + quoted phrase", () => {
    expect(
      shortReviewReasonLabel(`File explicitly mentions 'service militaire' in the body`)
    ).toBe('Mentions "service militaire"');
  });

  it("handles system gate reasons", () => {
    expect(shortReviewReasonLabel("Low confidence; needs review")).toBe("Low confidence");
  });

  it("shortens sorting rule skip", () => {
    expect(shortReviewReasonLabel("Sorting rule: skip (manual review) (rule-1)")).toBe(
      "Rule skip (rule-1)"
    );
  });

  it("clips long prose fallback", () => {
    const s = "This is a very long explanation that should be trimmed down for the UI";
    expect(shortReviewReasonLabel(s).endsWith("…")).toBe(true);
  });
});
