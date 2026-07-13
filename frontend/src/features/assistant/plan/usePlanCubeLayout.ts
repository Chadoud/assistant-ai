/**
 * Derives the cube visualizer layout from the active agent plan.
 *
 * Applies the gate (only reorganize for plans with >= PLAN_CUBE_MIN_STEPS steps)
 * and the completion lifecycle: hold the finished board briefly, then revert to
 * the idle tesseract by clearing the active task.
 */

import { useEffect } from "react";
import { PLAN_CUBE_MIN_STEPS, type TesseractPlan } from "../../../components/tesseractPlanLayout";
import { clearActivePlanTask, type PlanPhase, type PlanState } from "./planStore";
import { usePlanState } from "./usePlanStream";

const COMPLETE_HOLD_MS = 2500;
const CANCEL_HOLD_MS = 500;

function isTerminal(phase: PlanPhase): boolean {
  return phase === "complete" || phase === "error" || phase === "cancelled";
}

export interface PlanCubeLayout {
  layout: "idle" | "plan";
  plan: TesseractPlan | null;
}

/** Pure gate: only enter plan layout when the tree has enough steps. */
export function resolvePlanCubeLayout(planState: PlanState | null): PlanCubeLayout {
  const gatePassed = !!planState && planState.steps.length >= PLAN_CUBE_MIN_STEPS;
  if (gatePassed && planState) {
    return { layout: "plan", plan: { steps: planState.steps } };
  }
  return { layout: "idle", plan: null };
}

export function usePlanCubeLayout(): PlanCubeLayout {
  const planState = usePlanState();
  const resolved = resolvePlanCubeLayout(planState);
  const gatePassed = resolved.layout === "plan";

  useEffect(() => {
    if (!planState || !isTerminal(planState.phase)) return;
    // Sub-threshold plans never entered plan mode; clear immediately so a future
    // task can take over the visualizer.
    if (!gatePassed) {
      clearActivePlanTask(planState.taskId);
      return;
    }
    const hold = planState.phase === "cancelled" ? CANCEL_HOLD_MS : COMPLETE_HOLD_MS;
    const id = window.setTimeout(() => clearActivePlanTask(planState.taskId), hold);
    return () => window.clearTimeout(id);
  }, [planState, gatePassed]);

  return resolved;
}
