import { describe, expect, it } from "vitest";
import { fileCountBucket, jobOutcomeFromCounts, rateBucket } from "./buckets";

describe("fileCountBucket", () => {
  it("maps boundaries", () => {
    expect(fileCountBucket(1)).toBe("1-5");
    expect(fileCountBucket(5)).toBe("1-5");
    expect(fileCountBucket(6)).toBe("6-20");
    expect(fileCountBucket(101)).toBe("100+");
  });
});

describe("rateBucket", () => {
  it("returns 0% when numerator is zero", () => {
    expect(rateBucket(0, 10)).toBe("0%");
  });

  it("buckets percentages", () => {
    expect(rateBucket(1, 100)).toBe("1-10%");
    expect(rateBucket(20, 100)).toBe("11-30%");
    expect(rateBucket(40, 100)).toBe("30%+");
  });
});

describe("jobOutcomeFromCounts", () => {
  it("classifies outcomes", () => {
    expect(jobOutcomeFromCounts({ uncertainCount: 0, failedSortCount: 0, failedFetchCount: 0 })).toBe(
      "clean"
    );
    expect(jobOutcomeFromCounts({ uncertainCount: 2, failedSortCount: 0, failedFetchCount: 0 })).toBe(
      "has_uncertain"
    );
    expect(jobOutcomeFromCounts({ uncertainCount: 0, failedSortCount: 1, failedFetchCount: 0 })).toBe(
      "has_failures"
    );
    expect(jobOutcomeFromCounts({ uncertainCount: 1, failedSortCount: 1, failedFetchCount: 0 })).toBe(
      "mixed"
    );
  });
});
