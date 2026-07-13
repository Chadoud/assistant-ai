import { describe, expect, it } from "vitest";
import {
  markPendingOutputFolderSortTabToast,
  resetPendingOutputFolderSortTabToastForTests,
  takePendingOutputFolderSortTabToast,
} from "./outputFolderToast";

describe("outputFolderToast", () => {
  it("stores and consumes the pending path once", () => {
    resetPendingOutputFolderSortTabToastForTests();
    markPendingOutputFolderSortTabToast("/Users/me/Documents/Exo Sorted Files");
    expect(takePendingOutputFolderSortTabToast()).toBe("/Users/me/Documents/Exo Sorted Files");
    expect(takePendingOutputFolderSortTabToast()).toBeNull();
  });

  it("ignores blank paths", () => {
    resetPendingOutputFolderSortTabToastForTests();
    markPendingOutputFolderSortTabToast("   ");
    expect(takePendingOutputFolderSortTabToast()).toBeNull();
  });
});
