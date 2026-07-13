import type { AppSettings } from "../../../types/settings";
import { streamGeminiChatDirect } from "../../../api/streamGeminiChatDirect";
import { buildDefaultSystemPrompt } from "../../../systemCommands/assistantPrompts";
import { resolveGeminiApiKeyFromSettings } from "../../../utils/syncGeminiKeyToBackend";
import { resolveGeminiChatModel } from "../../../utils/geminiChatSetup";
import { isFreeTierQuotaError, showQuotaToast } from "../../../utils/quotaToast";
import { makeId, type ConversationMessage } from "../../../hooks/useConversations";
import type { ChatMessage } from "../../../api/assistantChat";
import { toDisplayText } from "./assistantChatHistory";
import { sanitizeUnbackedPromiseClaim } from "../../../utils/chatPromiseGuard";

type RunCloudOnlyAssistantMessageParams = {
  text: string;
  settings: AppSettings;
  localMessages: ConversationMessage[];
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  setIsStreaming: (value: boolean) => void;
  onDraftClear: () => void;
  signal?: AbortSignal;
};

const CLOUD_ONLY_SYSTEM_SUFFIX =
  "\n\n[LOCAL APP SERVICE OFFLINE]\nYou are answering in cloud-only mode. You cannot access files, email, calendar, integrations, memory, or sorting on this computer until the local app service is running. Say so plainly if the user asks for those actions.";

/** Gemini chat without the local Python backend — no tools or integrations. */
export async function runCloudOnlyAssistantMessage({
  text,
  settings,
  localMessages,
  setMessages,
  setIsStreaming,
  onDraftClear,
  signal,
}: RunCloudOnlyAssistantMessageParams): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const promiseFailureText =
    "I said I'd do that but can't run actions while the local app service is offline.";

  const turnId = makeId();
  const userMsgId = `${turnId}-user`;
  const assistantMsgId = `${turnId}-assistant`;
  const apiKey = resolveGeminiApiKeyFromSettings(settings);
  const model = resolveGeminiChatModel(settings);

  const userMsg: ConversationMessage = {
    id: userMsgId,
    role: "user",
    content: trimmed,
    createdAt: new Date().toISOString(),
  };

  setMessages((prev) => [
    ...prev,
    userMsg,
    { id: assistantMsgId, role: "assistant", content: "", streaming: true },
  ]);
  onDraftClear();
  setIsStreaming(true);

  const history: ChatMessage[] = [
    { role: "system", content: `${buildDefaultSystemPrompt(undefined)}${CLOUD_ONLY_SYSTEM_SUFFIX}` },
    ...localMessages
      .filter((message) => !message.streaming && !message.prefetching && message.content.trim())
      .slice(-18)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
    { role: "user", content: trimmed },
  ];

  let accumulated = "";

  await streamGeminiChatDirect({
    apiKey,
    model,
    messages: history,
    signal,
    onDelta: (delta) => {
      accumulated += delta;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMsgId
            ? { ...message, content: toDisplayText(accumulated) }
            : message,
        ),
      );
    },
    onDone: (fullText) => {
      const display = sanitizeUnbackedPromiseClaim(
        toDisplayText(fullText) || accumulated,
        false,
        promiseFailureText,
      );
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMsgId
            ? { ...message, content: display, streaming: false }
            : message,
        ),
      );
      setIsStreaming(false);
    },
    onError: (message) => {
      if (isFreeTierQuotaError(message)) showQuotaToast();
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMsgId
            ? { ...item, content: message, streaming: false }
            : item,
        ),
      );
      setIsStreaming(false);
    },
  });
}
