import { describe, expect, it } from "vitest";
import {
  PLAN_CUBE_MIN_STEPS,
  PLAN_MAX_SLOTS,
  PLAN_STEP_CUBE,
  PLAN_SUB_CUBE,
  computePlanColumnBounds,
  computePlanFocusTransform,
  assignUniqueStepShortTitles,
  deriveStepShortTitle,
  buildPlanBoardLayout,
  buildPlanConnections,
  buildPlanSlots,
  compactPlanForLayout,
  shouldShowPlanTravelCube,
  type CubeStatusVisual,
  type TesseractPlan,
} from "./tesseractPlanLayout";
import { resolvePlanCubeLayout } from "../features/assistant/plan/usePlanCubeLayout";
import type { PlanState } from "../features/assistant/plan/planStore";

function makePlan(stepDefs: number[]): TesseractPlan {
  return {
    steps: stepDefs.map((subCount, i) => ({
      index: i + 1,
      description: `Step ${i + 1}`,
      status: "pending" as const,
      subtasks: Array.from({ length: subCount }, (_, j) => ({
        index: j + 1,
        description: `Sub ${j + 1}`,
        status: "pending" as const,
      })),
    })),
  };
}

describe("buildPlanSlots", () => {
  it("returns no slots for an empty plan", () => {
    expect(buildPlanSlots({ steps: [] }, 1280)).toEqual([]);
  });

  it("orders step cubes first, then subtask cubes grouped per step", () => {
    const slots = buildPlanSlots(makePlan([2, 1]), 1280);
    // 2 steps + 3 subtasks = 5 slots
    expect(slots).toHaveLength(5);
    expect(slots.slice(0, 2).every((s) => s.kind === "step")).toBe(true);
    expect(slots.slice(2).every((s) => s.kind === "subtask")).toBe(true);
    expect(slots[0].size).toBe(PLAN_STEP_CUBE);
    expect(slots[2].size).toBe(PLAN_SUB_CUBE);
  });

  it("centers the step row horizontally around the origin", () => {
    const slots = buildPlanSlots(makePlan([0, 0, 0, 0]), 1280);
    const xs = slots.filter((s) => s.kind === "step").map((s) => s.target.x);
    const sum = xs.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(1e-6); // symmetric => centered
    // strictly increasing left-to-right
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it("stacks subtasks in a descending column under their step's x", () => {
    const slots = buildPlanSlots(makePlan([3]), 1280, 400);
    const step = slots[0];
    const subs = slots.filter((s) => s.kind === "subtask");
    expect(subs.every((s) => s.target.x === step.target.x)).toBe(true);
    for (let i = 1; i < subs.length; i++) {
      expect(subs[i].target.y).toBeGreaterThan(subs[i - 1].target.y);
    }
    // subtasks sit below the step row
    expect(subs[0].target.y).toBeGreaterThan(step.target.y);
  });

  it("uses short overview tiles with full detail preserved", () => {
    const plan: TesseractPlan = {
      steps: [
        {
          index: 1,
          description: "Install dependencies with npm",
          status: "pending",
          subtasks: [],
        },
      ],
    };
    const { slots } = buildPlanBoardLayout(plan, 1280, 400);
    const step = slots[0];
    expect(step?.kind).toBe("step");
    if (step?.kind === "step") {
      expect(step.label).toBe("Install");
      expect(step.detail).toContain("Install dependencies");
    }
  });

  it("compresses step spacing to fit narrow center columns", () => {
    const plan = makePlan([0, 0, 0, 0, 0, 0]);
    const { slots, metrics } = buildPlanBoardLayout(plan, 420, 320);
    const xs = slots.filter((s) => s.kind === "step").map((s) => s.target.x);
    const span = Math.max(...xs) - Math.min(...xs) + metrics.stepCubeSize;
    expect(span * metrics.boardScale).toBeLessThanOrEqual(420 * 0.92 + 2);
  });
});

describe("deriveStepShortTitle", () => {
  it("maps common planner phrases to compact tiles", () => {
    expect(deriveStepShortTitle("Install dependencies", 3)).toBe("Install");
    expect(deriveStepShortTitle("Implement task state management and localStorage", 4)).toBe("State");
    expect(deriveStepShortTitle("Add filtering functionality for categories", 2)).toBe("Filters");
    expect(deriveStepShortTitle("Preview the responsive task manager in browser", 7)).toBe("Preview");
    expect(deriveStepShortTitle("Implement the main UI components", 5)).toBe("Build");
    expect(deriveStepShortTitle("Create the post data types and mock data", 1)).toBe("Data");
  });
});

describe("assignUniqueStepShortTitles", () => {
  it("suffixes duplicate overview tiles", () => {
    const steps = [
      { index: 1, description: "Preview in browser", status: "pending" as const, subtasks: [] },
      { index: 2, description: "Verify preview works", status: "pending" as const, subtasks: [] },
    ];
    const labels = assignUniqueStepShortTitles(steps);
    expect(labels.get(1)).toBe("Preview");
    expect(labels.get(2)).toBe("Verify");
  });
});

describe("buildPlanConnections", () => {
  it("links the step row and each subtask spine", () => {
    const conns = buildPlanConnections(makePlan([2, 0]));
    // step row: 1 link (step0->step1). spine: step0->sub0, sub0->sub1 = 2 links.
    expect(conns).toEqual([
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 2, b: 3 },
    ]);
  });
});

describe("PLAN_CUBE_MIN_STEPS gate", () => {
  it("is 4 (plans with fewer steps stay idle)", () => {
    expect(PLAN_CUBE_MIN_STEPS).toBe(4);
    expect(makePlan([0, 0, 0]).steps.length < PLAN_CUBE_MIN_STEPS).toBe(true);
    expect(makePlan([0, 0, 0, 0]).steps.length >= PLAN_CUBE_MIN_STEPS).toBe(true);
  });
});

describe("resolvePlanCubeLayout", () => {
  function state(steps: number): PlanState {
    return {
      taskId: "t1",
      goal: "g",
      phase: "running",
      steps: Array.from({ length: steps }, (_, i) => ({
        index: i + 1,
        description: `Step ${i + 1}`,
        status: "pending" as const,
        subtasks: [],
      })),
      activeStepIndex: null,
      activeSubtaskIndex: null,
      finalResult: null,
      error: null,
      relayNotice: null,
      pendingApproval: null,
    };
  }

  it("stays idle when fewer than PLAN_CUBE_MIN_STEPS steps", () => {
    expect(resolvePlanCubeLayout(state(3))).toEqual({ layout: "idle", plan: null });
  });

  it("enters plan mode at the threshold", () => {
    const r = resolvePlanCubeLayout(state(4));
    expect(r.layout).toBe("plan");
    expect(r.plan?.steps).toHaveLength(4);
  });

  it("returns idle when planState is null", () => {
    expect(resolvePlanCubeLayout(null)).toEqual({ layout: "idle", plan: null });
  });
});

describe("compactPlanForLayout", () => {
  it("leaves small plans unchanged", () => {
    const plan = makePlan([2, 1]);
    expect(compactPlanForLayout(plan, PLAN_MAX_SLOTS)).toEqual(plan);
  });

  it("collapses overflow subtasks into a +N cube", () => {
    const plan: TesseractPlan = {
      steps: [
        {
          index: 1,
          description: "Big step",
          status: "pending",
          subtasks: Array.from({ length: 20 }, (_, i) => ({
            index: i + 1,
            description: `Sub ${i + 1}`,
            status: "pending" as const,
          })),
        },
      ],
    };
    const compacted = compactPlanForLayout(plan, 8);
    const slots = buildPlanSlots(compacted, 1280);
    expect(slots.length).toBeLessThanOrEqual(8);
    expect(slots.some((s) => s.label.startsWith("+"))).toBe(true);
  });
});

describe("shouldShowPlanTravelCube", () => {
  const stepRow = buildPlanSlots(makePlan([0, 0, 0, 0]), 1280).slice(0, 4);
  const statusMap = (statuses: CubeStatusVisual[]) =>
    new Map(stepRow.map((s, i) => [s.stepIndex, statuses[i] ?? "pending"]));

  it("animates any edge touching a running cube", () => {
    const running = stepRow.map((s, i) => ({ ...s, status: i === 1 ? "running" : s.status }));
    expect(
      shouldShowPlanTravelCube(running[0], running[1], statusMap(["pending", "running", "pending", "pending"])),
    ).toBe(true);
    expect(
      shouldShowPlanTravelCube(running[1], running[2], statusMap(["pending", "running", "pending", "pending"])),
    ).toBe(true);
  });

  it("animates the subtask spine while the parent step runs", () => {
    const plan = makePlan([2, 0, 0, 0]);
    plan.steps[0]!.status = "running";
    plan.steps[0]!.subtasks = [
      { index: 1, description: "a", status: "pending" },
      { index: 2, description: "b", status: "pending" },
    ];
    const slots = buildPlanSlots(plan, 1280);
    const map = new Map([[1, "running" as const]]);
    const step = slots[0];
    const sub1 = slots[4];
    const sub2 = slots[5];
    expect(shouldShowPlanTravelCube(step, sub1, map)).toBe(true);
    expect(shouldShowPlanTravelCube(sub1, sub2, map)).toBe(true);
  });

  it("pulses the step row during planning", () => {
    expect(shouldShowPlanTravelCube(stepRow[0], stepRow[1], statusMap([]), "planning")).toBe(true);
    expect(shouldShowPlanTravelCube(stepRow[0], stepRow[1], statusMap([]), "running")).toBe(false);
  });
});

describe("computePlanColumnBounds / computePlanFocusTransform", () => {
  it("focus transform zooms in for a narrow column", () => {
    const plan = makePlan([3, 0, 0, 0]);
    const { slots, metrics } = buildPlanBoardLayout(plan, 1280, 400);
    const positions = slots.map((s) => s.target);
    const bounds = computePlanColumnBounds(slots, positions, 1, metrics.labelMaxWidth);
    expect(bounds).not.toBeNull();
    const focus = computePlanFocusTransform(bounds!, 420, 320);
    expect(focus.scale).toBeGreaterThan(1);
    expect(focus.translateX).not.toBe(0);
  });
});
