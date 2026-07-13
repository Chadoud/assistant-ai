/**
 * Pure utilities for building and trimming chat history before sending to the LLM.
 *
 * No React, no side effects — safe to unit-test in isolation.
 */

import type { ChatMessage } from "../../../api/assistantChat";
import type { ConversationMessage } from "../../../hooks/useConversations";
import { extractExositesAction } from "../../../systemCommands/parseExositesAction";

/** Number of most-recent conversation turns always included in history, regardless of topic. */
const ALWAYS_RECENT_TURNS = 6;

/**
 * Returns recent conversation history weighted by topic relevance.
 *
 * The last `ALWAYS_RECENT_TURNS` turns are always included (recency). Older
 * turns are filtered to prefer messages whose topic flags match the current
 * intent, so that cross-topic noise (e.g. 15 email turns before a file
 * question) is trimmed before filling the remaining budget.
 *
 * All message bodies are capped at `maxCharsPerMessage` so the combined
 * history stays safe when combined with a large grounded system prompt.
 *
 * @param messages - Full conversation message list (user + assistant only; system messages are ignored).
 * @param currentIntent - Intent string used to filter older turns by topic relevance.
 * @param maxTurns - Total turns budget (recent + older combined, counted in pairs).
 * @param maxCharsPerMessage - Hard character cap applied to every message body.
 */
export function getWeightedHistory(
  messages: ConversationMessage[],
  currentIntent: string,
  maxTurns: number,
  maxCharsPerMessage = 2_000,
): ChatMessage[] {
  const eligible = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const recentPairs = ALWAYS_RECENT_TURNS * 2;
  const recent = eligible.slice(-recentPairs);
  const older = eligible.slice(0, -recentPairs);

  const isMailIntent = currentIntent === "read_mail" || currentIntent === "read_both";
  const isCalendarIntent =
    currentIntent === "read_calendar" ||
    currentIntent === "write_calendar" ||
    currentIntent === "read_both";

  const relevantOlder = older.filter((m) => {
    if (isMailIntent && m.mailRecap) return true;
    if (isCalendarIntent && m.calendarContext) return true;
    // For general intents (and intents where flags don't apply), include everything
    if (!isMailIntent && !isCalendarIntent) return true;
    return false;
  });

  const combined = [
    ...relevantOlder.slice(-((maxTurns - ALWAYS_RECENT_TURNS) * 2)),
    ...recent,
  ];

  return combined.map((m) => ({
    role: m.role as "user" | "assistant",
    content:
      m.content.length > maxCharsPerMessage
        ? m.content.slice(0, maxCharsPerMessage) + " […]"
        : m.content,
  }));
}

/**
 * Strips raw tool fence blocks from a streaming assistant response so the UI
 * only shows the human-readable portion of the message.
 *
 * @param fullText - Raw accumulated text from the LLM stream.
 */
export function toDisplayText(fullText: string): string {
  const extracted = extractExositesAction(fullText);
  const clean = extracted.displayText
    .replace(/```(?:exosites-action|json)?\s*[\s\S]*?```/gi, "")
    .replace(/\{[\s\S]*?"commandId"\s*:[\s\S]*?"args"\s*:[\s\S]*?\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean || fullText.trim();
}
