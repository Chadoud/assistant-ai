/**
 * Mirrors live chat conversations to the durable backend store and triggers
 * Omi-style distillation (summary + memories + tasks) when a conversation goes
 * idle or is left.
 *
 * The renderer's localStorage store stays the source of truth for live editing
 * (fast, offline). This module is an additive durability + knowledge layer:
 * every write is best-effort and never blocks or breaks the chat UX.
 */

import {
  distillConversation,
  upsertStoredConversation,
  type ChatTurn,
} from "../api/conversationsStore";
import type {
  Conversation,
  ConversationMessage,
  ConversationToolContext,
} from "../hooks/useConversations";

const MIRROR_DEBOUNCE_MS = 4000;
const DISTILL_MIN_MESSAGES = 4;

const mirrorTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Tracks last distilled fingerprint per conversation to avoid redundant LLM calls. */
const lastDistilledFingerprint = new Map<string, string>();

function toUserAssistantTurns(messages: ConversationMessage[]): ChatTurn[] {
  return messages
    .filter((m) => !m.streaming && !m.prefetching && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.calendarContext ? { calendar_context: true } : {}),
      ...(m.mailRecap ? { mail_recap: true } : {}),
    }));
}

function toolContextTurns(toolContext: ConversationToolContext[] | undefined): ChatTurn[] {
  return (toolContext ?? [])
    .filter((entry) => entry.name.trim() && entry.content.trim())
    .map((entry) => ({
      role: "tool",
      name: entry.name.trim(),
      content: entry.content.trim(),
    }));
}

/** User/assistant turns plus hidden tool JSON for mirror + distill payloads. */
export function buildPersistedTurns(conv: Pick<Conversation, "messages" | "toolContext">): ChatTurn[] {
  return [...toUserAssistantTurns(conv.messages), ...toolContextTurns(conv.toolContext)];
}

function distillFingerprint(conv: Conversation): string {
  const turns = toUserAssistantTurns(conv.messages);
  const toolCount = conv.toolContext?.length ?? 0;
  return `${turns.length}:${toolCount}`;
}

/** Subject/title lines from calendar and mail recap bubbles for origin fuzzy-match. */
function collectOriginHints(messages: ConversationMessage[]): string[] {
  const hints: string[] = [];
  for (const message of messages) {
    if (!message.calendarContext && !message.mailRecap) continue;
    for (const line of message.content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length >= 6) hints.push(trimmed);
    }
  }
  return hints;
}

/** Persist a conversation's current state to the backend (debounced per id). */
export function mirrorConversation(conv: Conversation): void {
  const existing = mirrorTimers.get(conv.id);
  if (existing) clearTimeout(existing);
  mirrorTimers.set(
    conv.id,
    setTimeout(() => {
      mirrorTimers.delete(conv.id);
      const turns = buildPersistedTurns(conv);
      if (turns.length === 0) return;
      void upsertStoredConversation(conv.id, {
        title: conv.title,
        summary: conv.summary ?? "",
        messages: turns,
        created_at: new Date(conv.createdAt).toISOString(),
      }).catch(() => {
        /* best-effort durability */
      });
    }, MIRROR_DEBOUNCE_MS),
  );
}

/**
 * Distill a conversation that's being left/closed: extracts a structured summary,
 * memories, and tasks. No-op for short conversations or when nothing changed
 * since the last distillation.
 */
export function maybeDistill(conv: Conversation | undefined): void {
  if (!conv) return;
  const userTurns = toUserAssistantTurns(conv.messages);
  if (userTurns.length < DISTILL_MIN_MESSAGES) return;
  const fingerprint = distillFingerprint(conv);
  if (lastDistilledFingerprint.get(conv.id) === fingerprint) return;
  lastDistilledFingerprint.set(conv.id, fingerprint);

  // Flush any pending mirror first so the stored row exists before distillation.
  const pending = mirrorTimers.get(conv.id);
  if (pending) clearTimeout(pending);
  mirrorTimers.delete(conv.id);

  const turns = buildPersistedTurns(conv);
  const originHints = collectOriginHints(conv.messages);
  void distillConversation(conv.id, turns, originHints).catch(() => {
    // Allow a retry next time if distillation failed.
    lastDistilledFingerprint.delete(conv.id);
  });
}
