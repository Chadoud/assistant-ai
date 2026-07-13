/**
 * React hooks over the shared {@link planStore}.
 *
 * `usePlanStream(taskId)` subscribes to a single agent task's live state.
 * `useActivePlanTask()` returns the most recently started task (for the center
 * cube visualizer), and `usePlanState()` resolves that active task's state.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  type ActivePlanTask,
  type AgentActivity,
  type PlanState,
  getActivePlanTaskSnapshot,
  getAgentRosterSnapshot,
  getPlanSnapshot,
  subscribeActivePlanTask,
  subscribeAgentRoster,
  subscribePlan,
} from "./planStore";

export function usePlanStream(taskId: string | null | undefined): PlanState | null {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!taskId) return () => {};
      return subscribePlan(taskId, listener);
    },
    [taskId],
  );
  const getSnapshot = useCallback(() => (taskId ? getPlanSnapshot(taskId) : null), [taskId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useActivePlanTask(): ActivePlanTask | null {
  return useSyncExternalStore(
    subscribeActivePlanTask,
    getActivePlanTaskSnapshot,
    getActivePlanTaskSnapshot,
  );
}

/** Convenience: live state of the currently active plan task (or null). */
export function usePlanState(): PlanState | null {
  const active = useActivePlanTask();
  return usePlanStream(active?.taskId);
}

/**
 * Live list of every agent task currently working (planning or running),
 * regardless of which conversation tab is focused. Drives the "agents working"
 * strip under the center status text.
 */
export function useRunningAgents(): AgentActivity[] {
  return useSyncExternalStore(
    subscribeAgentRoster,
    getAgentRosterSnapshot,
    getAgentRosterSnapshot,
  );
}
