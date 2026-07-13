export const KNOWN_JOB_PHASES = new Set([
  "analyzing",
  "awaiting_approval",
  "applying",
  "paused",
  "cancelled",
  "done",
]);

export const JOB_STATUS_STYLE: Record<string, { dot: string; ring: string; text: string }> = {
  running: { dot: "bg-accent animate-pulse", ring: "border-accent-line bg-accent-light", text: "text-accent" },
  paused: { dot: "bg-warning", ring: "border-warning-line bg-warning-faint", text: "text-warning" },
  awaiting_approval: { dot: "bg-warning animate-pulse", ring: "border-warning-line bg-warning-faint", text: "text-warning" },
  done: { dot: "bg-success", ring: "border-success-line bg-success-faint", text: "text-success" },
  error: { dot: "bg-error", ring: "border-error-line bg-error-faint", text: "text-error" },
  cancelled: { dot: "bg-muted", ring: "border-border", text: "text-muted" },
};
