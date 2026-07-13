import { describe, it, expect } from "vitest";
import { codegenStateToPlan, resolveCodegenCubeLayout } from "./useCodegenCubeLayout";
import type { CodegenState } from "./codegenStore";
import { PLAN_CUBE_MIN_STEPS } from "../../components/tesseractPlanLayout";

function baseState(overrides: Partial<CodegenState> = {}): CodegenState {
  return {
    sessionId: "s1",
    goal: "Build app",
    phase: "generating",
    previewUrl: null,
    projectPath: "/tmp/p",
    stackLabel: null,
    installCommand: "npm install",
    devCommand: "npm run dev",
    logTail: "",
    filesWritten: 0,
    lastWrittenPath: null,
    recentFiles: [],
    skipInstall: false,
    reuseDevServer: false,
    error: null,
    errorClass: null,
    errorPackages: [],
    relayNotice: null,
    repairAttempts: 0,
    planSteps: [],
    stack: null,
    ...overrides,
  };
}

const JOURNEY: CodegenState["planSteps"] = [
  { title: "Build the feed UI", kind: "generate" },
  { title: "Wire up state", kind: "generate" },
  { title: "Install packages", kind: "install" },
  { title: "Start preview server", kind: "start" },
  { title: "Verify it renders", kind: "verify" },
  { title: "Live preview", kind: "preview" },
];

describe("codegenStateToPlan", () => {
  it("produces four steps for cube plan layout", () => {
    const plan = codegenStateToPlan(baseState());
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0].description).toContain("Write");
    expect(plan.steps[0].status).toBe("running");
  });

  it("maps file paths as subtasks under write step", () => {
    const plan = codegenStateToPlan(
      baseState({ recentFiles: ["src/App.tsx", "package.json"], filesWritten: 2 })
    );
    expect(plan.steps[0].subtasks).toHaveLength(2);
    expect(plan.steps[0].subtasks[1].description).toBe("package.json");
  });

  it("uses lastWrittenPath when recentFiles is empty", () => {
    const plan = codegenStateToPlan(
      baseState({ lastWrittenPath: "src/App.tsx", filesWritten: 1, phase: "generating" })
    );
    expect(plan.steps[0].subtasks[0].description).toBe("App.tsx");
  });

  it("shows placeholder label before first file is written", () => {
    const plan = codegenStateToPlan(baseState({ phase: "generating" }));
    expect(plan.steps[0].subtasks[0].description).toBe("Writing files");
  });

  it("marks later steps done when preview is ready", () => {
    const plan = codegenStateToPlan(baseState({ phase: "ready" }));
    expect(plan.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("inserts a running fix step while self-correcting", () => {
    const plan = codegenStateToPlan(baseState({ phase: "repairing", repairAttempts: 1 }));
    const fix = plan.steps.find((s) => s.description.startsWith("Fix build errors"));
    expect(fix).toBeDefined();
    expect(fix?.status).toBe("running");
    expect(plan.steps).toHaveLength(5);
  });

  it("keeps the fix step after a repair and labels the live preview last", () => {
    const plan = codegenStateToPlan(baseState({ phase: "ready", repairAttempts: 2 }));
    expect(plan.steps).toHaveLength(5);
    expect(plan.steps[plan.steps.length - 1].description).toBe("Live preview");
    expect(plan.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("renders the AI-authored journey when a plan is present", () => {
    const plan = codegenStateToPlan(baseState({ planSteps: JOURNEY, phase: "scaffolding" }));
    expect(plan.steps).toHaveLength(JOURNEY.length);
    expect(plan.steps.map((s) => s.description)).toEqual(JOURNEY.map((s) => s.title));
    // Only the last build step runs while scaffolding/generating; the rest pend.
    expect(plan.steps[0].status).toBe("done");
    expect(plan.steps[1].status).toBe("running");
    expect(plan.steps[2].status).toBe("pending");
  });

  it("marks the install step active during install in the journey", () => {
    const plan = codegenStateToPlan(baseState({ planSteps: JOURNEY, phase: "installing" }));
    expect(plan.steps[0].status).toBe("done");
    expect(plan.steps[1].status).toBe("done");
    expect(plan.steps[2].status).toBe("running");
    expect(plan.steps[3].status).toBe("pending");
  });

  it("inserts a fix step into the journey while self-correcting", () => {
    const plan = codegenStateToPlan(
      baseState({ planSteps: JOURNEY, phase: "repairing", repairAttempts: 1 })
    );
    const fix = plan.steps.find((s) => s.description.startsWith("Fix build errors"));
    expect(fix).toBeDefined();
    expect(fix?.status).toBe("running");
    // The fix step is inserted right before the preview step.
    expect(plan.steps[plan.steps.length - 1].description).toBe("Live preview");
  });

  it("completes every journey step when ready", () => {
    const plan = codegenStateToPlan(baseState({ planSteps: JOURNEY, phase: "ready" }));
    expect(plan.steps.every((s) => s.status === "done")).toBe(true);
  });
});

describe("resolveCodegenCubeLayout", () => {
  it("enters plan mode while building", () => {
    const state = baseState({ planSteps: JOURNEY, phase: "generating" });
    const layout = resolveCodegenCubeLayout(state, state.sessionId, null);
    expect(layout.layout).toBe("plan");
    expect(layout.plan?.steps.length).toBeGreaterThanOrEqual(PLAN_CUBE_MIN_STEPS);
  });

  it("holds plan mode when ready until suppressed", () => {
    const state = baseState({ planSteps: JOURNEY, phase: "ready" });
    expect(resolveCodegenCubeLayout(state, state.sessionId, null).layout).toBe("plan");
  });

  it("reverts to idle tesseract after completion hold", () => {
    const state = baseState({ planSteps: JOURNEY, phase: "ready" });
    const layout = resolveCodegenCubeLayout(state, state.sessionId, state.sessionId);
    expect(layout).toEqual({ layout: "idle", plan: null });
  });
});
