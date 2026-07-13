import { CHAT_DRAFT_QUEUE_EVENT, CHAT_DRAFT_QUEUE_SESSION_KEY } from "../constants";

/** Which chat surface should receive a queued composer prefill. */
export type ChatDraftTarget = "assistant" | "exo";

type StoredChatDraft = {
  text: string;
  target: ChatDraftTarget;
};

function readStoredDraft(): StoredChatDraft | null {
  try {
    const raw = sessionStorage.getItem(CHAT_DRAFT_QUEUE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredChatDraft>;
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    const target = parsed.target === "exo" ? "exo" : parsed.target === "assistant" ? "assistant" : null;
    if (!text || !target) return null;
    return { text, target };
  } catch {
    return null;
  }
}

function clearStoredDraft(): void {
  try {
    sessionStorage.removeItem(CHAT_DRAFT_QUEUE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Queue a one-shot message for a specific chat surface (Chat tab vs Exo rail).
 * Only the matching surface should call {@link consumeChatDraft}.
 */
export function queueChatDraft(text: string, target: ChatDraftTarget = "assistant"): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const payload: StoredChatDraft = { text: trimmed, target };
  try {
    sessionStorage.setItem(CHAT_DRAFT_QUEUE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHAT_DRAFT_QUEUE_EVENT, { detail: target }));
  }
}

/** Read and clear a queued draft when it belongs to this chat surface. */
export function consumeChatDraft(forTarget: ChatDraftTarget): string | null {
  const stored = readStoredDraft();
  if (!stored || stored.target !== forTarget) return null;
  clearStoredDraft();
  return stored.text;
}

/** Whether a draft is waiting for a given surface (without consuming). */
export function hasQueuedChatDraft(forTarget: ChatDraftTarget): boolean {
  const stored = readStoredDraft();
  return stored?.target === forTarget;
}
