/** Human-readable Ollama pull phase for Settings tables (masks digest noise). */
export function formatInstallPhase(phase: string): string {
  return phase.replace(/\b[0-9a-f]{8,}\b/gi, "layer").replace(/pulling/i, "Downloading");
}
