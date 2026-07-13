import { describe, expect, it } from "vitest";
import { resolveAttentionNavigation } from "./todoNavigation";

describe("resolveAttentionNavigation", () => {
  it("routes memory review to filtered memories", () => {
    expect(
      resolveAttentionNavigation({
        key: "memory",
        title: "Review",
        kind: "memory_review",
        nudgeIds: [],
      }),
    ).toEqual({ tab: "memories", filter: "needsReview" });
  });

  it("routes failed agent tasks to inbox", () => {
    expect(
      resolveAttentionNavigation({
        key: "fail",
        title: "Review recent failed tasks",
        kind: "nudge",
        nudgeIds: [1],
      }),
    ).toEqual({ tab: "tasks", subTab: "inbox" });
  });

  it("routes due tasks to today", () => {
    expect(
      resolveAttentionNavigation({
        key: "due",
        title: "Prep",
        kind: "task_due",
        nudgeIds: [2],
      }),
    ).toEqual({ tab: "tasks", subTab: "today" });
  });
});
