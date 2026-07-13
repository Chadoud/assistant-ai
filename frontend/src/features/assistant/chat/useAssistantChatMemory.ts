import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "../../../types/settings";
import { fetchMemory, formatMemoryForPrompt } from "../../../api/memory";
import { ASSISTANT_MEMORY_SAVED_EVENT } from "../../../constants";

/** Load and refresh the memory block injected into assistant turns. */
export function useAssistantChatMemory(
  conversationId: string,
  settings: AppSettings,
  backendOnline: boolean,
): string {
  const [memoryBlock, setMemoryBlock] = useState("");

  const refreshMemory = useCallback(() => {
    if (!backendOnline || !settings.assistantMemoryEnabled) return;
    fetchMemory(conversationId)
      .then((store) => setMemoryBlock(formatMemoryForPrompt(store)))
      .catch(() => {});
  }, [backendOnline, conversationId, settings.assistantMemoryEnabled]);

  useEffect(() => {
    if (!backendOnline || !settings.assistantMemoryEnabled) {
      setMemoryBlock("");
      return;
    }
    fetchMemory(conversationId)
      .then((store) => setMemoryBlock(formatMemoryForPrompt(store)))
      .catch(() => setMemoryBlock(""));
  }, [backendOnline, conversationId, settings.assistantMemoryEnabled]);

  useEffect(() => {
    const onMemorySaved = () => refreshMemory();
    window.addEventListener(ASSISTANT_MEMORY_SAVED_EVENT, onMemorySaved);
    return () => window.removeEventListener(ASSISTANT_MEMORY_SAVED_EVENT, onMemorySaved);
  }, [refreshMemory]);

  return memoryBlock;
}
