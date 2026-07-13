import { ASSISTANT_REPLY_COMPLETE_EVENT } from "../constants";

/**
 * Call when an assistant reply finishes so {@link AssistantReplyToolBridge} can parse tools.
 *
 * Wire this from the chat/voice surface when streaming completes (single place that owns the full
 * assistant message text). Without this event, `exosites-action` fences in replies are never executed.
 */
export function notifyAssistantReplyComplete(fullAssistantText: string): void {
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_REPLY_COMPLETE_EVENT, { detail: { text: fullAssistantText } })
  );
}
