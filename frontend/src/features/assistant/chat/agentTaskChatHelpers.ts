/**
 * Chat message helpers for autonomous agent tasks and mail tool outcomes.
 */

import type { ConversationMessage } from "../../../hooks/useConversations";
import { getPlanSnapshot, subscribePlan, type PlanPhase } from "../plan/planStore";

export function upsertAgentTaskMessage(
  prev: ConversationMessage[],
  taskId: string,
  goal: string,
  makeMessageId: () => string,
): ConversationMessage[] {
  const existingIdx = prev.findIndex((m) => m.agentTaskId === taskId);
  if (existingIdx >= 0) {
    return prev.map((m, i) =>
      i === existingIdx
        ? { ...m, content: "__agent_task__", agentGoal: goal, agentTaskId: taskId }
        : m,
    );
  }
  return [
    ...prev,
    {
      id: makeMessageId(),
      role: "assistant",
      content: "__agent_task__",
      agentGoal: goal,
      agentTaskId: taskId,
      createdAt: new Date().toISOString(),
    },
  ];
}

function isTerminalPhase(phase: PlanPhase): boolean {
  return phase === "complete" || phase === "error" || phase === "cancelled";
}

function formatPlanOutcome(taskId: string): string | null {
  const state = getPlanSnapshot(taskId);
  if (!state || !isTerminalPhase(state.phase)) return null;
  if (state.phase === "complete" && state.finalResult?.trim()) {
    return state.finalResult.trim();
  }
  if (state.error?.trim()) {
    return state.error.trim();
  }
  if (state.phase === "cancelled") {
    return "Task cancelled.";
  }
  return null;
}

/** Subscribe once; append a plain outcome bubble when the plan reaches a terminal phase. */
export function watchPlanTaskCompletion(
  taskId: string,
  _goal: string,
  appendOutcome: (text: string) => void,
): () => void {
  let reported = false;
  const report = () => {
    if (reported) return;
    const outcome = formatPlanOutcome(taskId);
    if (!outcome) return;
    reported = true;
    appendOutcome(outcome.startsWith("Done") ? outcome : `Done — ${outcome}`);
  };
  const unsub = subscribePlan(taskId, report);
  report();
  return unsub;
}

interface MailToolResult {
  ok?: boolean;
  data?: {
    moved_count?: number;
    filter_id?: string;
  };
  error?: string;
}

/** Plain-language summary for google_workspace mail manage tool results. */
export function formatMailManageToolOutcome(tool: string, result: unknown): string | null {
  const r = result as MailToolResult;
  if (!r?.ok) {
    const err = typeof r?.error === "string" && r.error.trim() ? r.error.trim() : null;
    return err ? `Couldn't complete that mail action — ${err}` : null;
  }
  const data = r.data ?? {};
  if (tool === "google_workspace" || tool.includes("google_workspace")) {
    const moved = data.moved_count;
    const filterId = data.filter_id;
    if (typeof moved === "number" && moved > 0 && filterId) {
      return `Moved ${moved} email${moved === 1 ? "" : "s"} to Spam and added a filter for future mail.`;
    }
    if (typeof moved === "number" && moved > 0) {
      return `Moved ${moved} email${moved === 1 ? "" : "s"} to Spam.`;
    }
    if (filterId) {
      return "Added a filter so future messages from that sender skip your inbox.";
    }
  }
  return null;
}

export function isMailManageToolResult(result: unknown): boolean {
  const data = (result as MailToolResult)?.data;
  return Boolean(data && (data.moved_count != null || data.filter_id != null));
}
