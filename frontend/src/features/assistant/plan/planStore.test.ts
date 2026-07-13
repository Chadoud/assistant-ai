import { describe, expect, it } from "vitest";
import { describeAgentActivity, reducePlanEvent, type PlanState } from "./planStore";

function base(): PlanState {
  return {
    taskId: "t1",
    goal: "",
    phase: "planning",
    steps: [],
    activeStepIndex: null,
    activeSubtaskIndex: null,
    finalResult: null,
    error: null,
    relayNotice: null,
  };
}

describe("reducePlanEvent", () => {
  it("shows relay notice during planning failover", () => {
    const next = reducePlanEvent(base(), {
      type: "provider_relay",
      from: "gemini",
      to: "anthropic",
      kind: "reasoning",
    });
    expect(next.phase).toBe("planning");
    expect(next.relayNotice).toBe("Switching to Anthropic…");
  });

  it("clears relay notice when plan_ready arrives", () => {
    let s = reducePlanEvent(base(), {
      type: "provider_relay",
      to: "anthropic",
    });
    s = reducePlanEvent(s, { type: "plan_ready", step_count: 1 });
    expect(s.relayNotice).toBeNull();
    expect(s.phase).toBe("running");
  });

  it("captures the goal on task_start", () => {
    const next = reducePlanEvent(base(), { type: "task_start", goal: "sort files" });
    expect(next.goal).toBe("sort files");
    expect(next.phase).toBe("planning");
  });

  it("builds the labeled tree from plan_ready", () => {
    const next = reducePlanEvent(base(), {
      type: "plan_ready",
      step_count: 2,
      steps: [
        { index: 1, description: "Gather", subtasks: [{ index: 1, description: "scan" }] },
        { index: 2, description: "Finish", subtasks: [] },
      ],
    });
    expect(next.phase).toBe("running");
    expect(next.steps).toHaveLength(2);
    expect(next.steps[0].description).toBe("Gather");
    expect(next.steps[0].subtasks[0].description).toBe("scan");
    expect(next.steps[0].subtasks[0].status).toBe("pending");
    expect(next.steps[1].subtasks).toHaveLength(0);
  });

  it("falls back to step_count when plan_ready has no tree (back-compat)", () => {
    const next = reducePlanEvent(base(), { type: "plan_ready", step_count: 3 });
    expect(next.steps).toHaveLength(3);
    expect(next.steps.every((s) => s.subtasks.length === 0)).toBe(true);
  });

  it("marks a step running on step_start and clears it on step_done", () => {
    let s = reducePlanEvent(base(), {
      type: "plan_ready",
      steps: [{ index: 1, description: "A", subtasks: [] }],
    });
    s = reducePlanEvent(s, { type: "step_start", step: 1, description: "A" });
    expect(s.activeStepIndex).toBe(1);
    expect(s.steps[0].status).toBe("running");

    s = reducePlanEvent(s, { type: "step_done", step: 1, ok: true });
    expect(s.activeStepIndex).toBeNull();
    expect(s.steps[0].status).toBe("done");
  });

  it("tracks subtask transitions and marks error on failure", () => {
    let s = reducePlanEvent(base(), {
      type: "plan_ready",
      steps: [{ index: 1, description: "A", subtasks: [{ index: 1, description: "x" }] }],
    });
    s = reducePlanEvent(s, { type: "subtask_start", step: 1, subtask: 1, description: "x" });
    expect(s.activeStepIndex).toBe(1);
    expect(s.activeSubtaskIndex).toBe(1);
    expect(s.steps[0].subtasks[0].status).toBe("running");

    s = reducePlanEvent(s, { type: "subtask_done", step: 1, subtask: 1, ok: false });
    expect(s.activeSubtaskIndex).toBeNull();
    expect(s.steps[0].subtasks[0].status).toBe("error");
  });

  it("records the final result on task_complete and clears cursors", () => {
    let s = reducePlanEvent(base(), { type: "step_start", step: 1 });
    s = reducePlanEvent(s, { type: "task_complete", result: "All done." });
    expect(s.phase).toBe("complete");
    expect(s.finalResult).toBe("All done.");
    expect(s.activeStepIndex).toBeNull();
  });

  it("captures errors and cancellation as terminal phases", () => {
    const err = reducePlanEvent(base(), { type: "task_error", error: "boom" });
    expect(err.phase).toBe("error");
    expect(err.error).toBe("boom");

    const cancelled = reducePlanEvent(base(), { type: "task_cancelled" });
    expect(cancelled.phase).toBe("cancelled");
  });

  it("ignores heartbeats and unknown frames", () => {
    const start = base();
    expect(reducePlanEvent(start, { type: "heartbeat" })).toBe(start);
    expect(reducePlanEvent(start, { type: "mystery" })).toBe(start);
  });
});

describe("describeAgentActivity", () => {
  it("reports planning, preferring an active relay notice", () => {
    expect(describeAgentActivity(base())).toBe("Planning…");
    expect(
      describeAgentActivity({ ...base(), relayNotice: "Switching to Anthropic…" }),
    ).toBe("Switching to Anthropic…");
  });

  it("reports the active subtask description, falling back to the step", () => {
    const withTree: PlanState = {
      ...base(),
      phase: "running",
      activeStepIndex: 1,
      activeSubtaskIndex: 2,
      steps: [
        {
          index: 1,
          description: "Read inbox",
          status: "running",
          subtasks: [
            { index: 1, description: "open", status: "done" },
            { index: 2, description: "Reading PDFs", status: "running" },
          ],
        },
      ],
    };
    expect(describeAgentActivity(withTree)).toBe("Reading PDFs");
    expect(describeAgentActivity({ ...withTree, activeSubtaskIndex: null })).toBe("Read inbox");
  });

  it("falls back to a generic label when running without a known step", () => {
    expect(describeAgentActivity({ ...base(), phase: "running" })).toBe("Working…");
  });

  it("returns empty string for terminal phases (filtered out of the roster)", () => {
    expect(describeAgentActivity({ ...base(), phase: "complete" })).toBe("");
    expect(describeAgentActivity({ ...base(), phase: "error" })).toBe("");
    expect(describeAgentActivity({ ...base(), phase: "cancelled" })).toBe("");
  });
});
