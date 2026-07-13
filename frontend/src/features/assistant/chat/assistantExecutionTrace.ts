/**
 * In-memory ring buffer of assistant execution events for debug export (schema v6).
 */

export type ExecutionTracePath =
  | "voice"
  | "turn_sse"
  | "assistant_chat"
  | "cloud_only"
  | "ipc";

export interface ExecutionToolRecord {
  name: string;
  ok: boolean;
  error?: string;
  summary?: string;
}

export interface ExecutionTraceEntry {
  at: string;
  turnId?: string;
  path: ExecutionTracePath;
  intent?: string;
  toolsCalled: ExecutionToolRecord[];
  promiseGuardFired?: boolean;
  ipcGateReason?: string;
  provider?: string;
  providerError?: string;
}

export interface DiagnosticLogEntry {
  kind: string;
  at: string;
  detail: Record<string, unknown>;
}

const MAX_EXECUTION_TRACE = 30;
const MAX_DIAGNOSTIC_LOG = 20;

let executionTrace: ExecutionTraceEntry[] = [];
let diagnosticLog: DiagnosticLogEntry[] = [];

export function pushExecutionTrace(entry: Omit<ExecutionTraceEntry, "at"> & { at?: string }): void {
  executionTrace = [
    ...executionTrace.slice(-(MAX_EXECUTION_TRACE - 1)),
    { ...entry, at: entry.at ?? new Date().toISOString() },
  ];
}

export function pushDiagnosticLog(kind: string, detail: Record<string, unknown> = {}): void {
  diagnosticLog = [
    ...diagnosticLog.slice(-(MAX_DIAGNOSTIC_LOG - 1)),
    { kind, at: new Date().toISOString(), detail },
  ];
}

export function getExecutionTraceSnapshot(): ExecutionTraceEntry[] {
  return executionTrace;
}

export function getDiagnosticLogSnapshot(): DiagnosticLogEntry[] {
  return diagnosticLog;
}

/** Redact sensitive values before export. */
export function redactDiagnosticDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("key") ||
      lower.includes("password") ||
      lower.includes("path") ||
      lower.includes("prompt")
    ) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "string" && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}
