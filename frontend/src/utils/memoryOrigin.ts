import type { ScopedMemoryEntry } from "../api/memory";

/** Keep in sync with memoryUi.ts AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD */
const HIDDEN_NOISE_THRESHOLD = 0.35;
import type { Task } from "../api/tasks";

const PROVIDER_I18N: Record<string, string> = {
  gmail_message: "memories.source.gmail",
  outlook_message: "memories.source.outlookMail",
  google_calendar_event: "memories.source.googleCalendar",
  outlook_calendar_event: "memories.source.outlookCalendar",
  conversation: "memories.source.chat",
  meeting: "memories.source.meeting",
  manual: "memories.source.manual",
};

/** i18n key for a provider kind, or null for generic provenance fallback. */
export function memoryOriginProviderKey(originKind: string | null | undefined): string | null {
  if (!originKind) return null;
  return PROVIDER_I18N[originKind] ?? null;
}

/** Whether the row might be openable (has origin ref, linked task, or conversation). */
export function memoryMayHaveOpenTarget(entry: ScopedMemoryEntry): boolean {
  if (
    entry.source === "auto" &&
    !entry.reviewed &&
    (entry.noise_score ?? 0) >= HIDDEN_NOISE_THRESHOLD
  ) {
    return false;
  }
  if (entry.origin_url || entry.origin_ref || entry.linked_task_id) return true;
  if (entry.origin_kind === "conversation" && entry.origin_ref?.startsWith("conv:")) return true;
  return entry.source === "auto";
}

export function taskMayHaveOpenTarget(task: Task): boolean {
  return Boolean(task.external_id || task.source_conversation_id || task.source_url);
}
