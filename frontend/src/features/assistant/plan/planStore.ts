/**
 * Shared agent-plan stream store.
 *
 * The backend agent-task SSE (`GET /agent/task/{id}`) is a *single-consumer*
 * stream: it drains one `asyncio.Queue`, so two EventSource connections to the
 * same task would split events between them. This store therefore owns exactly
 * ONE EventSource per task id and broadcasts the parsed {@link PlanState} to all
 * subscribers (the in-chat TaskProgressCard and the Exo cube visualizer).
 *
 * It also tracks a single "active" task — the most recently started one — so the
 * AI Manager center knows which plan to visualize.
 *
 * Designed for React's `useSyncExternalStore`: snapshots are cached and only
 * replaced when an event mutates them, so getSnapshot returns a stable identity.
 */

import { extractApiError, getApiHeaders } from "../../../api/client";
import { desktopClient } from "../../../desktopClient";

export type CubeStatus = "pending" | "running" | "done" | "error";

export type PlanPhase = "planning" | "running" | "complete" | "error" | "cancelled";

export interface PlanSubtask {
  index: number;
  description: string;
  status: CubeStatus;
}

export interface PlanStep {
  index: number;
  description: string;
  status: CubeStatus;
  subtasks: PlanSubtask[];
}

export interface PlanState {
  taskId: string;
  goal: string;
  phase: PlanPhase;
  steps: PlanStep[];
  /** 1-based index of the step currently running, or null. */
  activeStepIndex: number | null;
  /** 1-based index of the subtask currently running within the active step, or null. */
  activeSubtaskIndex: number | null;
  finalResult: string | null;
  error: string | null;
  /** Shown while planning when the Conductor relays to another provider. */
  relayNotice: string | null;
}

type Listener = () => void;

interface Entry {
  state: PlanState;
  /** AbortController for the authenticated fetch-based SSE reader. */
  streamAbort: AbortController | null;
  listeners: Set<Listener>;
}

const entries = new Map<string, Entry>();

// ── Active-task tracking ─────────────────────────────────────────────────────

export interface ActivePlanTask {
  taskId: string;
  goal: string;
}

let activeSnapshot: ActivePlanTask | null = null;
const activeListeners = new Set<Listener>();

function notifyActive(): void {
  activeListeners.forEach((l) => l());
}

export function setActivePlanTask(taskId: string, goal: string): void {
  // Every started task joins the running-agent roster so it stays observable
  // (and keeps streaming) even after the user switches to another tab/agent.
  registerAgentTask(taskId, goal);
  if (activeSnapshot?.taskId === taskId) return;
  activeSnapshot = { taskId, goal };
  notifyActive();
}

export function clearActivePlanTask(taskId?: string): void {
  if (taskId && activeSnapshot?.taskId !== taskId) return;
  if (activeSnapshot === null) return;
  activeSnapshot = null;
  notifyActive();
}

export function subscribeActivePlanTask(listener: Listener): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

export function getActivePlanTaskSnapshot(): ActivePlanTask | null {
  return activeSnapshot;
}

// ── Per-task state ───────────────────────────────────────────────────────────

function initialState(taskId: string): PlanState {
  return {
    taskId,
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

function getOrCreateEntry(taskId: string): Entry {
  let entry = entries.get(taskId);
  if (!entry) {
    entry = { state: initialState(taskId), streamAbort: null, listeners: new Set() };
    entries.set(taskId, entry);
  }
  return entry;
}

function notify(entry: Entry): void {
  entry.listeners.forEach((l) => l());
}

function isTerminal(phase: PlanPhase): boolean {
  return phase === "complete" || phase === "error" || phase === "cancelled";
}

/** Apply one parsed SSE frame to a plan state, returning a new immutable state. */
export function reducePlanEvent(state: PlanState, frame: Record<string, unknown>): PlanState {
  const type = String(frame.type ?? "");

  switch (type) {
    case "task_start":
      return { ...state, goal: String(frame.goal ?? state.goal), phase: "planning" };

    case "planning":
      return { ...state, phase: "planning" };

    case "provider_relay": {
      const to = String(frame.to ?? "").trim();
      const label = to ? to.charAt(0).toUpperCase() + to.slice(1) : "another provider";
      return { ...state, phase: "planning", relayNotice: `Switching to ${label}…` };
    }

    case "plan_ready": {
      const rawSteps = Array.isArray(frame.steps) ? (frame.steps as unknown[]) : null;
      let steps: PlanStep[];
      if (rawSteps) {
        steps = rawSteps.map((s, i) => {
          const obj = (s ?? {}) as Record<string, unknown>;
          const subs = Array.isArray(obj.subtasks) ? (obj.subtasks as unknown[]) : [];
          return {
            index: typeof obj.index === "number" ? obj.index : i + 1,
            description: String(obj.description ?? `Step ${i + 1}`),
            status: "pending" as CubeStatus,
            subtasks: subs.map((su, j) => {
              const sub = (su ?? {}) as Record<string, unknown>;
              return {
                index: typeof sub.index === "number" ? sub.index : j + 1,
                description: String(sub.description ?? `Subtask ${j + 1}`),
                status: "pending" as CubeStatus,
              };
            }),
          };
        });
      } else {
        // Back-compat: older backend only sends step_count.
        const count = typeof frame.step_count === "number" ? frame.step_count : 0;
        steps = Array.from({ length: count }, (_, i) => ({
          index: i + 1,
          description: `Step ${i + 1}`,
          status: "pending" as CubeStatus,
          subtasks: [],
        }));
      }
      return { ...state, phase: "running", steps, relayNotice: null };
    }

    case "step_start": {
      const idx = frame.step as number;
      const desc = frame.description as string | undefined;
      return {
        ...state,
        activeStepIndex: idx,
        activeSubtaskIndex: null,
        steps: state.steps.map((s) =>
          s.index === idx
            ? { ...s, status: "running", description: desc ?? s.description }
            : s,
        ),
      };
    }

    case "step_done": {
      const idx = frame.step as number;
      const ok = Boolean(frame.ok);
      return {
        ...state,
        activeStepIndex: state.activeStepIndex === idx ? null : state.activeStepIndex,
        activeSubtaskIndex: state.activeStepIndex === idx ? null : state.activeSubtaskIndex,
        steps: state.steps.map((s) =>
          s.index === idx ? { ...s, status: ok ? "done" : "error" } : s,
        ),
      };
    }

    case "subtask_start": {
      const stepIdx = frame.step as number;
      const subIdx = frame.subtask as number;
      const desc = frame.description as string | undefined;
      return {
        ...state,
        activeStepIndex: stepIdx,
        activeSubtaskIndex: subIdx,
        steps: state.steps.map((s) =>
          s.index === stepIdx
            ? {
                ...s,
                subtasks: s.subtasks.map((su) =>
                  su.index === subIdx
                    ? { ...su, status: "running", description: desc ?? su.description }
                    : su,
                ),
              }
            : s,
        ),
      };
    }

    case "subtask_done": {
      const stepIdx = frame.step as number;
      const subIdx = frame.subtask as number;
      const ok = Boolean(frame.ok);
      return {
        ...state,
        activeSubtaskIndex:
          state.activeSubtaskIndex === subIdx ? null : state.activeSubtaskIndex,
        steps: state.steps.map((s) =>
          s.index === stepIdx
            ? {
                ...s,
                subtasks: s.subtasks.map((su) =>
                  su.index === subIdx ? { ...su, status: ok ? "done" : "error" } : su,
                ),
              }
            : s,
        ),
      };
    }

    case "task_complete":
      return {
        ...state,
        phase: "complete",
        finalResult: String(frame.result ?? ""),
        activeStepIndex: null,
        activeSubtaskIndex: null,
      };

    case "task_error":
      return {
        ...state,
        phase: "error",
        error: String(frame.error ?? "Task failed."),
        activeStepIndex: null,
        activeSubtaskIndex: null,
      };

    case "task_cancelled":
      return {
        ...state,
        phase: "cancelled",
        activeStepIndex: null,
        activeSubtaskIndex: null,
      };

    default:
      // heartbeat and unknown frames: no change.
      return state;
  }
}

function applyFrame(entry: Entry, frame: Record<string, unknown>): void {
  entry.state = reducePlanEvent(entry.state, frame);
  notify(entry);
}

function parseSseBuffer(buf: string): { frames: Record<string, unknown>[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: Record<string, unknown>[] = [];
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith("data:")) continue;
    try {
      frames.push(JSON.parse(line.slice(5).trim()) as Record<string, unknown>);
    } catch {
      /* skip malformed chunk */
    }
  }
  return { frames, rest };
}

function closeStream(entry: Entry): void {
  entry.streamAbort?.abort();
  entry.streamAbort = null;
}

/** EventSource cannot send X-App-Token; use fetch + ReadableStream instead. */
function openSource(taskId: string, entry: Entry): void {
  if (entry.streamAbort) return;
  const controller = new AbortController();
  entry.streamAbort = controller;

  void (async () => {
    let res: Response;
    try {
      res = await desktopClient.fetch(`/agent/task/${encodeURIComponent(taskId)}`, {
        headers: await getApiHeaders(),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      entry.state = {
        ...entry.state,
        phase: "error",
        error: e instanceof Error ? e.message : "Connection to task stream lost.",
      };
      notify(entry);
      closeStream(entry);
      return;
    }

    if (!res.ok) {
      if (controller.signal.aborted) return;
      const detail = await extractApiError(res);
      entry.state = { ...entry.state, phase: "error", error: detail };
      notify(entry);
      closeStream(entry);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      entry.state = { ...entry.state, phase: "error", error: "Task stream unavailable." };
      notify(entry);
      closeStream(entry);
      return;
    }

    const decoder = new TextDecoder();
    let buf = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSseBuffer(buf);
        buf = rest;
        for (const frame of frames) {
          applyFrame(entry, frame);
          if (isTerminal(entry.state.phase)) {
            await reader.cancel();
            closeStream(entry);
            return;
          }
        }
      }
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      if (!isTerminal(entry.state.phase)) {
        entry.state = {
          ...entry.state,
          phase: "error",
          error: e instanceof Error ? e.message : "Connection to task stream lost.",
        };
        notify(entry);
      }
    } finally {
      closeStream(entry);
    }
  })();
}

export function subscribePlan(taskId: string, listener: Listener): () => void {
  const entry = getOrCreateEntry(taskId);
  entry.listeners.add(listener);
  openSource(taskId, entry);

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      closeStream(entry);
      // Drop finished entries with no remaining subscribers to avoid leaks.
      if (isTerminal(entry.state.phase) && activeSnapshot?.taskId !== taskId) {
        entries.delete(taskId);
      }
    }
  };
}

export function getPlanSnapshot(taskId: string): PlanState | null {
  return entries.get(taskId)?.state ?? null;
}

// ── Running-agent roster ─────────────────────────────────────────────────────
//
// The roster lets the UI answer "which agents are working right now, and what is
// each one doing?" — independent of which conversation tab is focused. It owns a
// persistent subscription per started task, which (a) keeps that task's single
// SSE stream alive even after its in-chat card unmounts on a tab switch, and
// (b) recomputes a compact, immutable snapshot for `useSyncExternalStore`.

/** One running agent task, reduced to what the status strip needs to show. */
export interface AgentActivity {
  taskId: string;
  /** The agent's goal (the user's original request). */
  goal: string;
  phase: PlanPhase;
  /** Plain-language line describing the current step, e.g. "Reading PDFs". */
  activity: string;
}

const rosterListeners = new Set<Listener>();
/** taskId → unsubscribe for the roster's persistent stream-keepalive subscription. */
const rosterUnsubs = new Map<string, () => void>();
let rosterSnapshot: AgentActivity[] = [];

/**
 * Reduce a live plan state to a one-line "what is it doing now" string.
 * Returns "" for terminal phases (those are filtered out of the roster).
 *
 * @param state - Live plan state for one agent task.
 */
export function describeAgentActivity(state: PlanState): string {
  if (state.phase === "planning") return state.relayNotice ?? "Planning…";
  if (state.phase === "running") {
    const step = state.steps.find((s) => s.index === state.activeStepIndex);
    if (step) {
      const sub = step.subtasks.find((su) => su.index === state.activeSubtaskIndex);
      return (sub?.description || step.description || "Working…").trim();
    }
    return "Working…";
  }
  return "";
}

function rostersEqual(a: AgentActivity[], b: AgentActivity[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].taskId !== b[i].taskId ||
      a[i].phase !== b[i].phase ||
      a[i].goal !== b[i].goal ||
      a[i].activity !== b[i].activity
    ) {
      return false;
    }
  }
  return true;
}

/** Rebuild the snapshot from non-terminal rostered tasks; only notifies on real change. */
function rebuildRosterSnapshot(): void {
  const next: AgentActivity[] = [];
  for (const taskId of rosterUnsubs.keys()) {
    const state = entries.get(taskId)?.state;
    if (!state || isTerminal(state.phase)) continue;
    next.push({
      taskId,
      goal: state.goal,
      phase: state.phase,
      activity: describeAgentActivity(state),
    });
  }
  if (rostersEqual(rosterSnapshot, next)) return;
  rosterSnapshot = next;
  rosterListeners.forEach((l) => l());
}

/** Release roster subscriptions for tasks that have reached a terminal phase. */
function releaseTerminalRosterTasks(): void {
  for (const [taskId, unsub] of [...rosterUnsubs.entries()]) {
    const state = entries.get(taskId)?.state;
    if (!state || isTerminal(state.phase)) {
      unsub();
      rosterUnsubs.delete(taskId);
    }
  }
}

/**
 * Add a task to the running-agent roster (idempotent). Opens a persistent
 * subscription that shares the task's single SSE stream and keeps it alive
 * across tab switches. Called automatically by {@link setActivePlanTask}.
 *
 * @param taskId - Backend agent task id.
 * @param goal - The agent's goal, seeded until the first `task_start` frame.
 */
function registerAgentTask(taskId: string, goal: string): void {
  if (rosterUnsubs.has(taskId)) return;

  const entry = getOrCreateEntry(taskId);
  if (!entry.state.goal && goal) {
    entry.state = { ...entry.state, goal };
  }

  const unsub = subscribePlan(taskId, () => {
    rebuildRosterSnapshot();
    // Defer cleanup so we never mutate the listener set during a notify pass.
    queueMicrotask(() => {
      releaseTerminalRosterTasks();
      rebuildRosterSnapshot();
    });
  });
  rosterUnsubs.set(taskId, unsub);
  rebuildRosterSnapshot();
}

export function subscribeAgentRoster(listener: Listener): () => void {
  rosterListeners.add(listener);
  return () => rosterListeners.delete(listener);
}

export function getAgentRosterSnapshot(): AgentActivity[] {
  return rosterSnapshot;
}

/** Cancel a running task (best effort) and mark it cancelled locally. */
export async function cancelPlanTask(taskId: string): Promise<void> {
  const entry = entries.get(taskId);
  if (entry) {
    closeStream(entry);
    if (!isTerminal(entry.state.phase)) {
      entry.state = { ...entry.state, phase: "cancelled" };
      notify(entry);
    }
  }
  try {
    await desktopClient.deleteAgentTask(taskId);
  } catch {
    /* best effort */
  }
}
