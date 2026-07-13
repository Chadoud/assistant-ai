/**
 * Structured diagnostics for packaged Electron (written to userData/renderer-diagnostics.log).
 */

import { pushDiagnosticLog } from "../features/assistant/chat/assistantExecutionTrace";

export function logAppDiagnostic(kind: string, detail: Record<string, unknown> = {}): void {
  const payload = { kind, at: new Date().toISOString(), ...detail };
  pushDiagnosticLog(kind, detail);
  void window.electronAPI?.appendRendererDiagnostic?.(payload);
  console.warn(`[exo:${kind}]`, detail);
}
