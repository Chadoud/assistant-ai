/**
 * Module-level mutable ref for the currently active conversation ID.
 *
 * AssistantReplyToolBridge is mounted at App root (above the conversation
 * provider) so it cannot receive the conversation ID as a prop without
 * threading it through the entire tree. This module avoids that coupling:
 * AssistantChatPanelCore writes the active ID here when the conversation
 * changes, and AssistantReplyToolBridge reads it when executing save_memory.
 *
 * This is NOT a reactive store — callers must not derive render logic from it.
 */

let _activeConversationId: string | undefined;

export function setActiveConversationId(id: string | undefined): void {
  _activeConversationId = id;
}

export function getActiveConversationId(): string | undefined {
  return _activeConversationId;
}
