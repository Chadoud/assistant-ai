/**
 * Best-effort repair for legacy voice history where briefing sections were merged
 * into one assistant bubble.
 */

import type { ConversationMessage } from "../../../hooks/useConversations";
import { randomHexId } from "../../../utils/randomHexId";

function makeSplitId(): string {
  return randomHexId();
}

/** Minimum chars before attempting a split (merged blobs from voice are usually 400+). */
const MERGED_BLOB_MIN_CHARS = 280;

/**
 * Sentence boundaries where a new assistant bubble likely began before the merge bug fix.
 * Order matters — more specific patterns first.
 */
const ASSISTANT_SEGMENT_BOUNDARY =
  /(?<=[.!?])\s*(?=Fetching your briefing|Good (?:evening|morning|afternoon)\b|Breaking news:|I opened WhatsApp|I couldn't reach your calendar|It's (?:a clear|clear)|You've got quite a few|Understood\.|Sorry, I didn't|Done —|There(?:'s| is) significant|The latest headlines)/i;

/** Missing-space merge artifact: "...now.Good evening" */
const TIGHT_BOUNDARY =
  /\.(?=Fetching your briefing|Good (?:evening|morning|afternoon)\b|Breaking news|I opened WhatsApp|Done —)/i;

function isSplittableAssistantMessage(message: ConversationMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.content.length < MERGED_BLOB_MIN_CHARS) return false;
  if (message.streaming || message.prefetching) return false;
  if (message.agentGoal || message.codegenGoal || message.calendarContext || message.mailRecap) {
    return false;
  }
  return ASSISTANT_SEGMENT_BOUNDARY.test(message.content) || TIGHT_BOUNDARY.test(message.content);
}

function splitContent(text: string): string[] {
  const normalized = text.replace(TIGHT_BOUNDARY, ". ").trim();
  const parts = normalized
    .split(ASSISTANT_SEGMENT_BOUNDARY)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text.trim()];
}

/**
 * Splits one merged assistant message into several bubbles (legacy repair).
 */
export function splitMergedAssistantMessage(message: ConversationMessage): ConversationMessage[] {
  if (!isSplittableAssistantMessage(message)) {
    return [message];
  }

  const segments = splitContent(message.content);
  if (segments.length <= 1) {
    return [message];
  }

  const baseTime = message.createdAt ? Date.parse(message.createdAt) : Date.now();

  return segments.map((content, index) => ({
    ...message,
    id: index === 0 ? message.id : makeSplitId(),
    content,
    createdAt: new Date(baseTime + index).toISOString(),
    briefingSection: index === 0 ? message.briefingSection : undefined,
    briefingRunId: message.briefingRunId,
  }));
}

/**
 * Repairs a full message list: distinct ids + split legacy merged voice blobs.
 */
export function repairConversationMessages(messages: ConversationMessage[]): ConversationMessage[] {
  return messages.flatMap(splitMergedAssistantMessage);
}
