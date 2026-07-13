/**
 * Maps Codegen Studio session progress to the Tesseract plan-board layout
 * so cubes animate into write → install → preview steps.
 *
 * Completion lifecycle mirrors agent plans: hold the finished board briefly,
 * then revert to the idle tesseract while keeping the session for the Preview rail.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  PLAN_CUBE_MIN_STEPS,
  type CubeStatusVisual,
  type TesseractPlan,
  type TesseractPlanStep,
} from "../../components/tesseractPlanLayout";
import type { PlanCubeLayout } from "../assistant/plan/usePlanCubeLayout";
import {
  getActiveCodegenSessionId,
  getCodegenCubeLayoutSuppressedSessionId,
  subscribeActiveCodegen,
  subscribeCodegenCubeLayout,
  suppressCodegenCubeLayout,
  useCodegenState,
  type CodegenPhase,
  type CodegenState,
} from "./codegenStore";

const COMPLETE_HOLD_MS = 2500;
const CANCEL_HOLD_MS = 500;

type StepKey = "write" | "install" | "start" | "fix" | "preview";
type StepKind = "scaffold" | "generate" | "install" | "start" | "verify" | "preview" | "fix";

/** Pipeline rank shared by phases and step kinds, so status is honest. */
const KIND_RANK: Record<StepKind, number> = {
  scaffold: 1,
  generate: 1,
  install: 2,
  start: 3,
  verify: 4,
  fix: 4,
  preview: 5,
};

/** Pipeline rank per phase; phases not listed (error/cancelled/idle) default to the build rank. */
const PHASE_RANK: Partial<Record<CodegenPhase, number>> = {
  planning: 0,
  scaffolding: 1,
  generating: 1,
  installing: 2,
  starting: 3,
  verifying: 4,
  repairing: 4,
  ready: 5,
};

function phaseRank(phase: CodegenPhase): number {
  return PHASE_RANK[phase] ?? 1;
}

function isCodegenTerminal(phase: CodegenPhase): boolean {
  return phase === "ready" || phase === "error" || phase === "cancelled";
}

/** File names streamed from the backend, rendered as subtasks under the build step. */
function fileSubtasks(state: CodegenState) {
  const paths =
    state.recentFiles.length > 0
      ? state.recentFiles
      : state.lastWrittenPath
        ? [state.lastWrittenPath]
        : [];
  const building = state.phase === "generating" || state.phase === "scaffolding";

  const subtasks = paths.slice(0, 8).map((path, i) => {
    const isLast = i === paths.length - 1;
    let status: CubeStatusVisual = "done";
    if (building && isLast) status = "running";
    if (!building && state.filesWritten > 0) status = "done";
    const name = path.split("/").pop() || path;
    return { index: i + 1, description: name, status };
  });

  if (subtasks.length === 0 && building) {
    subtasks.push({ index: 1, description: "Writing files", status: "running" });
  }
  return subtasks;
}

/** The AI-authored journey: real status per step, no fake progress. */
function journeyPlan(state: CodegenState): TesseractPlan {
  const ordered: { title: string; kind: StepKind }[] = state.planSteps.map((s) => ({
    title: s.title,
    kind: (s.kind as StepKind) in KIND_RANK ? (s.kind as StepKind) : "generate",
  }));

  // Surface self-correction as a real step when it runs.
  if ((state.phase === "repairing" || state.repairAttempts > 0) && !ordered.some((s) => s.kind === "fix")) {
    const previewIdx = ordered.findIndex((s) => s.kind === "preview");
    const attempt = state.repairAttempts > 1 ? ` (try ${state.repairAttempts})` : "";
    const fixStep = { title: `Fix build errors${attempt}`, kind: "fix" as StepKind };
    ordered.splice(previewIdx >= 0 ? previewIdx : ordered.length, 0, fixStep);
  }

  const rank = phaseRank(state.phase);
  const errored = state.phase === "error";
  const errRank = state.repairAttempts > 0 ? KIND_RANK.fix : KIND_RANK.start;
  const lastAtRank = ordered.reduce((acc, s, i) => (KIND_RANK[s.kind] === rank ? i : acc), -1);
  const firstBuildIdx = ordered.findIndex((s) => s.kind === "generate" || s.kind === "scaffold");

  const steps: TesseractPlanStep[] = ordered.map((step, i) => {
    const r = KIND_RANK[step.kind];
    let status: CubeStatusVisual;
    if (errored) {
      status = r < errRank ? "done" : r === errRank ? "error" : "pending";
    } else if (state.phase === "ready") {
      status = "done";
    } else if (r < rank) {
      status = "done";
    } else if (r > rank) {
      status = "pending";
    } else {
      status = i === lastAtRank ? "running" : "done";
    }
    return {
      index: i + 1,
      description: step.title,
      status,
      subtasks: i === firstBuildIdx ? fileSubtasks(state) : [],
    };
  });
  return { steps };
}

/** Fixed pipeline backbone used when no AI plan is available (static/follow-up). */
function fixedPlan(state: CodegenState): TesseractPlan {
  const subtasks = fileSubtasks(state);
  const showFixStep = state.phase === "repairing" || state.repairAttempts > 0;
  const ordered: { key: StepKey; description: string }[] = [
    { key: "write", description: "Write project files" },
    { key: "install", description: state.skipInstall ? "Use existing packages" : "Install packages" },
    { key: "start", description: "Start preview server" },
  ];
  if (showFixStep) {
    const attemptLabel = state.repairAttempts > 1 ? ` (try ${state.repairAttempts})` : "";
    ordered.push({ key: "fix", description: `Fix build errors${attemptLabel}` });
  }
  ordered.push({ key: "preview", description: "Live preview" });

  const keyRank: Record<StepKey, number> = { write: 1, install: 2, start: 3, fix: 4, preview: 5 };
  const rank = phaseRank(state.phase);
  const errored = state.phase === "error";
  const errRank = state.repairAttempts > 0 ? 4 : 3;
  const lastAtRank = ordered.reduce((acc, s, i) => (keyRank[s.key] === rank ? i : acc), -1);

  const steps: TesseractPlanStep[] = ordered.map((step, i) => {
    const r = keyRank[step.key];
    let status: CubeStatusVisual;
    if (errored) status = r < errRank ? "done" : r === errRank ? "error" : "pending";
    else if (state.phase === "ready") status = "done";
    else if (r < rank) status = "done";
    else if (r > rank) status = "pending";
    else status = i === lastAtRank ? "running" : "done";
    return { index: i + 1, description: step.description, status, subtasks: step.key === "write" ? subtasks : [] };
  });
  return { steps };
}

/**
 * Build the Tesseract plan tree. Uses the AI-authored journey when the model
 * planned one; otherwise falls back to the fixed pipeline backbone. Step status
 * is always derived from the real phase / ground-truth file counts.
 */
export function codegenStateToPlan(state: CodegenState): TesseractPlan {
  if (state.planSteps.length >= PLAN_CUBE_MIN_STEPS) return journeyPlan(state);
  return fixedPlan(state);
}

/** Pure gate + suppression check for plan-board layout. */
export function resolveCodegenCubeLayout(
  state: CodegenState | null,
  sessionId: string | null,
  suppressedSessionId: string | null
): PlanCubeLayout {
  if (!state || state.phase === "idle") {
    return { layout: "idle", plan: null };
  }
  if (sessionId && suppressedSessionId === sessionId) {
    return { layout: "idle", plan: null };
  }
  const plan = codegenStateToPlan(state);
  if (plan.steps.length >= PLAN_CUBE_MIN_STEPS) {
    return { layout: "plan", plan };
  }
  return { layout: "idle", plan: null };
}

export function useCodegenCubeLayout(): PlanCubeLayout {
  const sessionId = useSyncExternalStore(
    subscribeActiveCodegen,
    getActiveCodegenSessionId,
    getActiveCodegenSessionId
  );
  const suppressedSessionId = useSyncExternalStore(
    subscribeCodegenCubeLayout,
    getCodegenCubeLayoutSuppressedSessionId,
    getCodegenCubeLayoutSuppressedSessionId
  );
  const state = useCodegenState(sessionId ?? undefined);

  const resolved = useMemo(
    () => resolveCodegenCubeLayout(state, sessionId, suppressedSessionId),
    [state, sessionId, suppressedSessionId]
  );
  const gatePassed = resolved.layout === "plan";

  useEffect(() => {
    if (!sessionId || !state || !isCodegenTerminal(state.phase)) return;
    if (!gatePassed) {
      suppressCodegenCubeLayout(sessionId);
      return;
    }
    const hold = state.phase === "cancelled" ? CANCEL_HOLD_MS : COMPLETE_HOLD_MS;
    const id = window.setTimeout(() => suppressCodegenCubeLayout(sessionId), hold);
    return () => window.clearTimeout(id);
  }, [sessionId, state, gatePassed]);

  return resolved;
}
