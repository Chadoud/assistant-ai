import { describe, expect, it } from "vitest";
import { UNCERTAIN_FOLDER } from "../constants";
import { OTHER_REASON_LABEL } from "./topNWithOther";
import {
  DESTINATION_UNCERTAIN_SLICE,
  destinationFolderSliceColor,
  destinationLegendColorForFolder,
  DESTINATION_SLICE_COLORS,
} from "./destinationFolderLegendColor";

describe("destinationFolderSliceColor", () => {
  it("uses hatch sentinel for Uncertain", () => {
    expect(destinationFolderSliceColor(UNCERTAIN_FOLDER, 0)).toBe(DESTINATION_UNCERTAIN_SLICE);
  });

  it("uses muted for Other aggregate", () => {
    expect(destinationFolderSliceColor(OTHER_REASON_LABEL, 3)).toBe("var(--text-muted)");
  });

  it("cycles slice colors by index", () => {
    expect(destinationFolderSliceColor("Invoices", 0)).toBe(DESTINATION_SLICE_COLORS[0]);
    expect(destinationFolderSliceColor("Receipts", 1)).toBe(DESTINATION_SLICE_COLORS[1]);
  });
});

describe("destinationLegendColorForFolder", () => {
  it("matches display row index", () => {
    const display = [
      { folder: "A", count: 10 },
      { folder: "B", count: 5 },
    ];
    const full = [...display, { folder: "C", count: 1 }];
    expect(destinationLegendColorForFolder("B", display, full)).toBe(
      destinationFolderSliceColor("B", 1)
    );
  });

  it("uses Other row color for folders merged out of display", () => {
    const display = [
      { folder: "A", count: 10 },
      { folder: OTHER_REASON_LABEL, count: 3 },
    ];
    const full = [
      { folder: "A", count: 10 },
      { folder: "Tail/Z", count: 3 },
    ];
    const otherIdx = 1;
    expect(destinationLegendColorForFolder("Tail/Z", display, full)).toBe(
      destinationFolderSliceColor(OTHER_REASON_LABEL, otherIdx)
    );
  });
});
