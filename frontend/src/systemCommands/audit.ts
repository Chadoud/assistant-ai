export function auditSystemCommand(entry: {
  commandId: string;
  outcome: "confirmed" | "ran" | "denied" | "error" | "skipped";
  detail?: string;
}): void {
  try {
    void window.electronAPI?.systemCommandAudit?.({
      commandId: entry.commandId,
      outcome: entry.outcome,
      detail: entry.detail,
    });
  } catch {
    /* ignore */
  }
}
