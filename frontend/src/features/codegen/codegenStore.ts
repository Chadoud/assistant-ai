/**
 * Codegen Studio session state — SSE broadcast + active session tracking.
 */

import { useSyncExternalStore } from "react";
import {
  cancelCodegenSession,
  fetchCodegenSessionStatus,
  openCodegenEventStream,
  repairCodegenSession,
  reportCodegenPreview,
  startCodegenSession,
  type CodegenRepairResponse,
  type StartCodegenSessionOptions,
} from "../../api/codegenSession";
import { track } from "../../telemetry/client";
import { TelemetryEventNames } from "../../telemetry/schema";

export type CodegenPhase =
  | "idle"
  | "planning"
  | "scaffolding"
  | "generating"
  | "installing"
  | "starting"
  | "verifying"
  | "repairing"
  | "ready"
  | "error"
  | "cancelled";

/** A step in the AI-authored build journey. */
export interface CodegenPlanStep {
  title: string;
  kind: "scaffold" | "generate" | "install" | "start" | "verify" | "preview" | "fix";
}

export interface CodegenState {
  sessionId: string;
  goal: string;
  phase: CodegenPhase;
  previewUrl: string | null;
  projectPath: string | null;
  stackLabel: string | null;
  installCommand: string | null;
  devCommand: string | null;
  logTail: string;
  filesWritten: number;
  lastWrittenPath: string | null;
  recentFiles: string[];
  skipInstall: boolean;
  reuseDevServer: boolean;
  error: string | null;
  /** Taxonomy class of the last diagnosed build error (plain-language cause in UI). */
  errorClass: string | null;
  /** Package names involved in the last diagnosed error (e.g. missing npm deps). */
  errorPackages: string[];
  relayNotice: string | null;
  repairAttempts: number;
  planSteps: CodegenPlanStep[];
  stack: string | null;
}

type Listener = () => void;

interface Entry {
  state: CodegenState;
  streamAbort: AbortController | null;
  devPipelineRunning: boolean;
  logPollTimer: ReturnType<typeof setInterval> | null;
  listeners: Set<Listener>;
}

const entries = new Map<string, Entry>();

let activeSessionId: string | null = null;
const activeListeners = new Set<Listener>();

let telemetryOptIn = false;
let telemetryLocale = "en";

/** Called from useAppTelemetry so codegen events respect user opt-in. */
export function setCodegenTelemetryContext(optIn: boolean, locale: string): void {
  telemetryOptIn = optIn;
  telemetryLocale = locale;
}

function emitCodegenTelemetry(
  name: (typeof TelemetryEventNames)[keyof typeof TelemetryEventNames],
  props: Record<string, string | number | boolean> = {}
): void {
  track(telemetryOptIn, telemetryLocale, name, props);
}

export type AssistantRailTab = "chat" | "preview";
let railTab: AssistantRailTab = "chat";
const railListeners = new Set<Listener>();

/** Goal shown in Preview while POST /codegen/session is in flight. */
let pendingLaunchGoal: string | null = null;
const pendingLaunchListeners = new Set<Listener>();

function notifyPendingLaunch(): void {
  pendingLaunchListeners.forEach((l) => l());
}

function getPendingLaunchGoalSnapshot(): string | null {
  return pendingLaunchGoal;
}

function subscribePendingLaunchGoal(listener: Listener): () => void {
  pendingLaunchListeners.add(listener);
  return () => pendingLaunchListeners.delete(listener);
}

export function usePendingCodegenLaunchGoal(): string | null {
  return useSyncExternalStore(
    subscribePendingLaunchGoal,
    getPendingLaunchGoalSnapshot,
    getPendingLaunchGoalSnapshot,
  );
}

function notifyRail(): void {
  railListeners.forEach((l) => l());
}

function getRailTabSnapshot(): AssistantRailTab {
  return railTab;
}

export function setRailTab(tab: AssistantRailTab): void {
  if (railTab === tab) return;
  railTab = tab;
  notifyRail();
}

/** Switch to Preview and show launch progress before the session API returns. */
export function beginCodegenStudioUi(goal: string): void {
  pendingLaunchGoal = goal;
  notifyPendingLaunch();
  resetCodegenCubeLayoutSuppression();
  setRailTab("preview");
}

export function clearPendingCodegenLaunch(): void {
  if (!pendingLaunchGoal) return;
  pendingLaunchGoal = null;
  notifyPendingLaunch();
}

function subscribeRailTab(listener: Listener): () => void {
  railListeners.add(listener);
  return () => railListeners.delete(listener);
}

function notifyActive(): void {
  activeListeners.forEach((l) => l());
}

export function getActiveCodegenSessionId(): string | null {
  return activeSessionId;
}

/** True when a session can still be resumed as a follow-up (not cancelled/failed). */
export function isResumableCodegenSession(sessionId: string): boolean {
  const entry = entries.get(sessionId);
  if (!entry) return false;
  return entry.state.phase !== "cancelled" && entry.state.phase !== "error";
}

export function subscribeActiveCodegen(listener: Listener): () => void {
  activeListeners.add(listener);
  return () => activeListeners.delete(listener);
}

/** Session whose plan board was dismissed — tesseract returns while preview stays available. */
let cubeLayoutSuppressedSessionId: string | null = null;
const cubeLayoutListeners = new Set<Listener>();

function notifyCubeLayout(): void {
  cubeLayoutListeners.forEach((l) => l());
}

export function getCodegenCubeLayoutSuppressedSessionId(): string | null {
  return cubeLayoutSuppressedSessionId;
}

/** Stop showing the codegen plan on the tesseract (preview rail keeps the session). */
export function suppressCodegenCubeLayout(sessionId: string): void {
  if (cubeLayoutSuppressedSessionId === sessionId) return;
  cubeLayoutSuppressedSessionId = sessionId;
  notifyCubeLayout();
}

function resetCodegenCubeLayoutSuppression(sessionId?: string): void {
  if (sessionId && cubeLayoutSuppressedSessionId !== sessionId) return;
  if (cubeLayoutSuppressedSessionId === null) return;
  cubeLayoutSuppressedSessionId = null;
  notifyCubeLayout();
}

export function subscribeCodegenCubeLayout(listener: Listener): () => void {
  cubeLayoutListeners.add(listener);
  return () => cubeLayoutListeners.delete(listener);
}

function initialState(sessionId: string, goal: string): CodegenState {
  return {
    sessionId,
    goal,
    phase: "generating",
    previewUrl: null,
    projectPath: null,
    stackLabel: null,
    installCommand: null,
    devCommand: null,
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
  };
}

function getEntry(sessionId: string, goal = ""): Entry {
  let entry = entries.get(sessionId);
  if (!entry) {
    entry = {
      state: initialState(sessionId, goal),
      streamAbort: null,
      devPipelineRunning: false,
      logPollTimer: null,
      listeners: new Set(),
    };
    entries.set(sessionId, entry);
  }
  return entry;
}

function notify(entry: Entry): void {
  entry.listeners.forEach((l) => l());
}

export function reduceCodegenEvent(state: CodegenState, frame: Record<string, unknown>): CodegenState {
  const type = String(frame.type ?? "");
  switch (type) {
    case "session_start":
      return { ...state, goal: String(frame.goal ?? state.goal), phase: "planning" };
    case "plan": {
      const rawSteps = Array.isArray(frame.steps) ? frame.steps : [];
      const planSteps = rawSteps
        .filter((s): s is { title: string; kind: string } => !!s && typeof s === "object")
        .map((s) => ({ title: String(s.title ?? ""), kind: String(s.kind ?? "generate") }))
        .filter((s) => s.title) as CodegenPlanStep[];
      return {
        ...state,
        phase: "planning",
        planSteps,
        stack: frame.stack ? String(frame.stack) : state.stack,
        relayNotice: null,
      };
    }
    case "phase": {
      const next = String(frame.phase ?? "");
      const allowed: CodegenPhase[] = ["planning", "scaffolding", "generating", "verifying"];
      return allowed.includes(next as CodegenPhase) ? { ...state, phase: next as CodegenPhase } : state;
    }
    case "provider_relay": {
      const to = String(frame.to ?? "").trim();
      const label = to ? to.charAt(0).toUpperCase() + to.slice(1) : "another provider";
      return { ...state, relayNotice: `Switching to ${label}…` };
    }
    case "file_written": {
      const path = typeof frame.path === "string" ? frame.path : null;
      const recent = path ? [path, ...state.recentFiles.filter((p) => p !== path)].slice(0, 8) : state.recentFiles;
      // Phase is driven by explicit "phase"/"plan" events; only nudge it forward
      // from an early state so a stray file_written never rewinds the journey.
      const phase: CodegenPhase = state.phase === "idle" || state.phase === "planning" ? "generating" : state.phase;
      return {
        ...state,
        phase,
        filesWritten: typeof frame.total === "number" ? frame.total : state.filesWritten + 1,
        lastWrittenPath: path,
        recentFiles: recent,
        relayNotice: null,
      };
    }
    case "awaiting_dev":
      return {
        ...state,
        phase: "installing",
        projectPath: String(frame.project_path ?? state.projectPath),
        stackLabel: String(frame.stack_label ?? state.stackLabel),
        installCommand: frame.install_command
          ? String(frame.install_command)
          : state.installCommand,
        devCommand: String(frame.dev_command ?? state.devCommand),
        filesWritten: typeof frame.files_written === "number" ? frame.files_written : state.filesWritten,
        skipInstall:
          Boolean(frame.skip_install) ||
          !frame.install_command ||
          String(frame.install_command ?? "").trim() === "",
        reuseDevServer: Boolean(frame.reuse_dev_server),
        relayNotice: null,
      };
    case "session_error":
      return { ...state, phase: "error", error: String(frame.error ?? "Build failed.") };
    case "session_cancelled":
      return { ...state, phase: "cancelled" };
    default:
      return state;
  }
}

function startLogPolling(sessionId: string): void {
  const api = window.electronAPI;
  if (!api?.codegenDevServerStatus) return;
  const entry = getEntry(sessionId);
  stopLogPolling(sessionId);
  entry.logPollTimer = setInterval(() => {
    void api.codegenDevServerStatus!({ sessionId }).then((status) => {
      if (!status.logTail) return;
      const current = getEntry(sessionId);
      if (current.state.logTail === status.logTail) return;
      current.state = { ...current.state, logTail: status.logTail };
      notify(current);
    });
  }, 2000);
}

function stopLogPolling(sessionId: string): void {
  const entry = entries.get(sessionId);
  if (!entry?.logPollTimer) return;
  clearInterval(entry.logPollTimer);
  entry.logPollTimer = null;
}

/**
 * Total automatic repair reruns per session. Deterministic fixes (missing npm
 * package, bad version) are cheap so this is generous; the backend separately
 * caps LLM repair calls and reports budget_exhausted, which ends the loop early.
 */
export const MAX_SELF_CORRECT_ATTEMPTS = 5;
/** Upper bound on waiting for a definitive compile verdict from the preview. */
const VERIFY_TIMEOUT_MS = 15000;
const VERIFY_POLL_MS = 700;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DevResult =
  | { kind: "ready"; buildError: string | null }
  | { kind: "server_down"; error: string }
  | { kind: "install_error"; error: string }
  | { kind: "skipped" };

/**
 * Install + start the dev server. Returns a result instead of finalizing the
 * outcome, so the caller can verify the render and self-correct. On repair
 * re-runs it skips a redundant install — unless the repair changed dependency
 * manifests (forceInstall), in which case the install must run again.
 */
async function runDevPipeline(
  sessionId: string,
  state: CodegenState,
  opts: { repair?: boolean; forceInstall?: boolean } = {}
): Promise<DevResult> {
  const api = window.electronAPI;
  if (!api?.codegenRunInstall || !state.projectPath || !state.devCommand) return { kind: "skipped" };
  if (!state.skipInstall && !state.installCommand?.trim()) return { kind: "skipped" };

  const entry = getEntry(sessionId);
  if (entry.devPipelineRunning) return { kind: "skipped" };
  entry.devPipelineRunning = true;

  const reuse = opts.repair ? false : state.reuseDevServer;
  if (!reuse) {
    if (api.codegenDevServerStop) await api.codegenDevServerStop({ sessionId });
    if (api.codegenPreviewHide) await api.codegenPreviewHide({ sessionId });
  }

  try {
    if (!state.skipInstall) {
      entry.state = { ...entry.state, phase: "installing", error: null };
      notify(entry);
      startLogPolling(sessionId);

      const install = await api.codegenRunInstall({
        sessionId,
        cwd: state.projectPath,
        installCommand: state.installCommand!.trim(),
        skipIfReady: Boolean(opts.repair) && !opts.forceInstall,
      });
      if (!install.ok) {
        entry.state = { ...entry.state, logTail: install.logTail ?? entry.state.logTail };
        notify(entry);
        emitCodegenTelemetry(TelemetryEventNames.codegenError, { selection: "install" });
        return { kind: "install_error", error: install.error ?? "Install failed." };
      }
      if (install.logTail) {
        entry.state = { ...entry.state, logTail: install.logTail };
        notify(entry);
      }
    } else {
      entry.state = {
        ...entry.state,
        phase: "installing",
        error: null,
        logTail: entry.state.logTail || "Skipped install — dependencies already present.",
      };
      notify(entry);
    }

    entry.state = { ...entry.state, phase: "starting" };
    notify(entry);

    const dev = await api.codegenDevServerStart({
      sessionId,
      cwd: state.projectPath,
      devCommand: state.devCommand,
      reuseIfRunning: reuse,
    });
    if (!dev.ok || !dev.url) {
      entry.state = { ...entry.state, logTail: dev.logTail ?? entry.state.logTail };
      notify(entry);
      return { kind: "server_down", error: dev.error ?? "Dev server failed to start." };
    }

    await reportCodegenPreview(sessionId, dev.url, dev.logTail ?? "");
    entry.state = {
      ...entry.state,
      phase: "ready",
      previewUrl: dev.url,
      logTail: dev.logTail ?? entry.state.logTail,
    };
    notify(entry);
    if (dev.reused && api.codegenPreviewReload) await api.codegenPreviewReload({ sessionId });
    return { kind: "ready", buildError: dev.buildError ? String(dev.buildError) : null };
  } finally {
    stopLogPolling(sessionId);
    entry.devPipelineRunning = false;
  }
}

/**
 * Poll the dev server + rendered DOM until a definitive compile verdict:
 * a build error / Vite error overlay (broken), rendered content (healthy),
 * or the timeout. A page that stays blank for the whole window counts as
 * broken; anything inconclusive at timeout passes so the user is not blocked.
 *
 * @returns the error text when broken, null when healthy.
 */
async function awaitCompileVerdict(sessionId: string): Promise<string | null> {
  const api = window.electronAPI;
  const started = Date.now();
  let lastBlankReason: string | null = null;
  while (Date.now() - started < VERIFY_TIMEOUT_MS) {
    const status = await api?.codegenDevServerStatus?.({ sessionId });
    if (status?.buildError) return String(status.buildError);
    const probe = await api?.codegenPreviewProbe?.({ sessionId });
    if (probe) {
      if (probe.kind === "overlay") return probe.reason || "The dev server reported a build error.";
      if (probe.ok && probe.kind === "ok") return null;
      if (probe.kind === "blank") {
        lastBlankReason = probe.reason || "The app rendered a blank page.";
      }
    }
    await delay(VERIFY_POLL_MS);
  }
  return lastBlankReason;
}

function markReady(sessionId: string): void {
  const entry = getEntry(sessionId);
  const repaired = entry.state.repairAttempts > 0;
  entry.state = { ...entry.state, phase: "ready", error: null };
  notify(entry);
  emitCodegenTelemetry(TelemetryEventNames.codegenPreviewReady, {
    stack: entry.state.stackLabel ?? "unknown",
  });
  if (repaired) {
    emitCodegenTelemetry(TelemetryEventNames.codegenRepairOutcome, {
      outcome: "fixed",
      error_class: entry.state.errorClass ?? "unknown",
    });
  }
}

function markRepairFailed(sessionId: string, error: string): void {
  const entry = getEntry(sessionId);
  entry.state = { ...entry.state, phase: "error", error };
  notify(entry);
  emitCodegenTelemetry(TelemetryEventNames.codegenRepairOutcome, {
    outcome: "failed",
    error_class: entry.state.errorClass ?? "unknown",
  });
}

/** Verify the live preview actually renders; self-correct if it is broken/blank. */
async function verifyAfterReady(sessionId: string, buildError: string | null): Promise<void> {
  const entry = getEntry(sessionId);
  entry.state = { ...entry.state, phase: "verifying" };
  notify(entry);
  const broken = buildError ?? (await awaitCompileVerdict(sessionId));
  if (!broken) {
    markReady(sessionId);
    return;
  }
  await maybeSelfCorrect(sessionId, broken);
}

/**
 * Ask the backend to diagnose + fix the error, then rebuild. The backend
 * classifies the error first (deterministic fixes don't cost an LLM call),
 * tracks the error fingerprint, and reports budget_exhausted when the same
 * error keeps returning — which ends the loop with a plain-language cause.
 */
async function maybeSelfCorrect(sessionId: string, errorText: string): Promise<void> {
  const entry = getEntry(sessionId);
  if (entry.state.repairAttempts >= MAX_SELF_CORRECT_ATTEMPTS) {
    markRepairFailed(sessionId, "Couldn't automatically fix the build. Open the logs or retry.");
    return;
  }
  entry.state = {
    ...entry.state,
    phase: "repairing",
    error: null,
    repairAttempts: entry.state.repairAttempts + 1,
  };
  notify(entry);

  let res: CodegenRepairResponse;
  try {
    res = await repairCodegenSession(sessionId, errorText, getEntry(sessionId).state.logTail);
  } catch {
    res = { ok: false };
  }

  const diagnosed = getEntry(sessionId);
  diagnosed.state = {
    ...diagnosed.state,
    errorClass: res.error_class ?? diagnosed.state.errorClass,
    errorPackages: res.packages ?? diagnosed.state.errorPackages,
  };
  notify(diagnosed);
  emitCodegenTelemetry(TelemetryEventNames.codegenError, {
    selection: "self_correct",
    error_class: res.error_class ?? "unknown",
  });

  if (!res.ok) {
    markRepairFailed(sessionId, res.error ?? "Auto-fix failed.");
    return;
  }
  await runPipelineWithCorrection(sessionId, true, Boolean(res.needs_install));
}

/** Run the dev pipeline, then verify the render and self-correct as needed. */
async function runPipelineWithCorrection(
  sessionId: string,
  repair = false,
  forceInstall = false
): Promise<void> {
  const result = await runDevPipeline(sessionId, getEntry(sessionId).state, { repair, forceInstall });
  if (result.kind === "ready") {
    await verifyAfterReady(sessionId, result.buildError);
  } else if (result.kind === "server_down" || result.kind === "install_error") {
    await maybeSelfCorrect(sessionId, result.error);
  }
}

function attachStream(sessionId: string, goal: string): void {
  const entry = getEntry(sessionId, goal);
  if (entry.streamAbort) return;
  const ac = new AbortController();
  entry.streamAbort = ac;
  void openCodegenEventStream(sessionId, ac.signal, (frame) => {
    const prev = entry.state;
    entry.state = reduceCodegenEvent(prev, frame);
    notify(entry);
    if (frame.type === "awaiting_dev") {
      void runPipelineWithCorrection(sessionId, false);
    }
  }).catch((err: unknown) => {
    if (ac.signal.aborted) return;
    entry.state = {
      ...entry.state,
      phase: "error",
      error: err instanceof Error ? err.message : "Stream disconnected.",
    };
    notify(entry);
  });
}

export async function launchCodegenSession(options: StartCodegenSessionOptions): Promise<string> {
  beginCodegenStudioUi(options.goal);
  try {
    const data = await startCodegenSession(options);
    const sessionId = data.session_id;
    const entry = getEntry(sessionId, options.goal);
    entry.state = initialState(sessionId, options.goal);
    entry.state.projectPath = data.project_path;
    activeSessionId = sessionId;
    notifyActive();
    attachStream(sessionId, options.goal);
    notify(entry);
    emitCodegenTelemetry(TelemetryEventNames.codegenSessionStart, {
      follow_up: options.followUp ? 1 : 0,
    });
    return sessionId;
  } finally {
    pendingLaunchGoal = null;
    notifyPendingLaunch();
  }
}

/** Re-run install + dev server after a pipeline error (files already on disk). */
export async function retryCodegenDevPipeline(sessionId: string): Promise<void> {
  const entry = entries.get(sessionId);
  if (!entry || entry.devPipelineRunning) return;
  const snapshot = {
    ...entry.state,
    phase: "installing" as CodegenPhase,
    error: null,
    errorClass: null,
    errorPackages: [],
    repairAttempts: 0,
  };
  entry.state = snapshot;
  notify(entry);
  await runPipelineWithCorrection(sessionId, false);
}

export async function stopCodegenSession(sessionId: string): Promise<void> {
  await cancelCodegenSession(sessionId);
  const api = window.electronAPI;
  if (api?.codegenDevServerStop) await api.codegenDevServerStop({ sessionId });
  if (api?.codegenPreviewHide) await api.codegenPreviewHide({ sessionId });
  const entry = entries.get(sessionId);
  if (entry) {
    stopLogPolling(sessionId);
    entry.streamAbort?.abort();
    entry.state = { ...entry.state, phase: "cancelled" };
    notify(entry);
  }
  // Forget the cancelled session so the next build request starts fresh
  // instead of resuming a dead one.
  if (activeSessionId === sessionId) {
    activeSessionId = null;
    notifyActive();
  }
}

export function useCodegenState(sessionId: string | null | undefined): CodegenState | null {
  return useSyncExternalStore(
    (listener) => {
      if (!sessionId) return () => {};
      const entry = getEntry(sessionId);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    () => (sessionId ? getEntry(sessionId).state : null),
    () => (sessionId ? getEntry(sessionId).state : null)
  );
}

export function useAssistantRailTab(): AssistantRailTab {
  return useSyncExternalStore(subscribeRailTab, getRailTabSnapshot, getRailTabSnapshot);
}

/** Hydrate store from backend when reopening Preview for a past session. */
export async function hydrateCodegenSession(sessionId: string): Promise<void> {
  try {
    const status = await fetchCodegenSessionStatus(sessionId);
    const entry = getEntry(sessionId, status.goal);
    const phase: CodegenPhase =
      status.status === "ready"
        ? "ready"
        : status.status === "failed"
          ? "error"
          : status.status === "cancelled"
            ? "cancelled"
            : entry.state.phase;
    const planSteps = Array.isArray(status.plan_steps)
      ? (status.plan_steps
          .filter((s): s is { title: string; kind: string } => !!s && typeof s === "object")
          .map((s) => ({ title: String(s.title ?? ""), kind: String(s.kind ?? "generate") }))
          .filter((s) => s.title) as CodegenPlanStep[])
      : entry.state.planSteps;
    entry.state = {
      ...entry.state,
      goal: status.goal,
      phase,
      previewUrl: status.preview_url,
      projectPath: status.project_path,
      stackLabel: status.stack_label,
      installCommand: status.install_command,
      devCommand: status.dev_command,
      filesWritten: status.files_written,
      logTail: status.log_tail,
      error: status.error,
      // Backend-persisted budget wins so a renderer reload can't reset the loop.
      repairAttempts: Math.max(entry.state.repairAttempts, status.repair_attempts ?? 0),
      planSteps,
    };
    if (sessionId === activeSessionId || !activeSessionId) {
      activeSessionId = sessionId;
      notifyActive();
    }
    if (phase === "ready" || phase === "error" || phase === "cancelled") {
      suppressCodegenCubeLayout(sessionId);
    }
    notify(entry);
    await maybeResumeStrandedPipeline(sessionId, status.status);
  } catch {
    /* session may have expired from memory */
  }
}

/**
 * A renderer reload mid-build kills the pipeline orchestration while the
 * backend session sits at "installing" forever. When hydration finds such a
 * stranded session (no live SSE stream, no running dev server), resume the
 * install → start → verify pipeline instead of leaving the user stuck.
 */
async function maybeResumeStrandedPipeline(sessionId: string, backendStatus: string): Promise<void> {
  if (backendStatus !== "installing" && backendStatus !== "starting") return;
  const entry = getEntry(sessionId);
  // A live session (SSE stream attached) drives its own pipeline.
  if (entry.streamAbort || entry.devPipelineRunning) return;
  if (!entry.state.projectPath || !entry.state.devCommand) return;
  const status = await window.electronAPI?.codegenDevServerStatus?.({ sessionId });
  if (status?.running) return;
  entry.state = { ...entry.state, phase: "installing", error: null };
  notify(entry);
  await runPipelineWithCorrection(sessionId, false);
}
