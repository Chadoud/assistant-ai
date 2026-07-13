/**
 * SSE streaming for assistant text chat — extracted from useAssistantChatController.
 */

import { streamAssistantChat, type ChatMessage } from "../../../api/assistantChat";
import { dispatchIntegrationClientActionFromSsePayload } from "../../../assistant/integrationClientActions";
import type { ChatProviderId } from "../../../types/settings";
import { sanitizeUnbackedCalendarClaim } from "../../../utils/chatFalseCompletionGuard";
import { sanitizeUnbackedPromiseClaim } from "../../../utils/chatPromiseGuard";
import { isFreeTierQuotaError, showQuotaToast } from "../../../utils/quotaToast";
import { relayConnectorTokens } from "../../../assistant/connectorContext";
import { notifyAssistantReplyComplete } from "../../../systemCommands/assistantReplyNotify";
import { pushExecutionTrace } from "./assistantExecutionTrace";
import type { ConversationMessage } from "../../../hooks/useConversations";
import { getWeightedHistory, toDisplayText } from "./assistantChatHistory";
import type { OutboundChatRecord } from "./AssistantChatPanelCore";
import type { AssistantIntent } from "../../../systemCommands/assistantIntent";
import {
  trackAssistantToolInvoked,
  trackAssistantTurnFailed,
  trackProviderError,
  trackSendMessageCompleted,
  trackSendMessageFailed,
  trackSendMessageStarted,
} from "../../../telemetry/assistantTelemetry";

interface RunAssistantChatStreamParams {
  assistantMsgId: string;
  userMsgId: string;
  text: string;
  intent: AssistantIntent;
  systemPrompt: string;
  conversationSummary?: string;
  localMessages: ConversationMessage[];
  provider: ChatProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
  useWebSearch: boolean;
  assistantToolsEnabled: boolean;
  wantsPrefetch: boolean;
  previousUserContent: string | null;
  outboundRingRef: React.MutableRefObject<OutboundChatRecord[]>;
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  setIsStreaming: (v: boolean) => void;
  onToolContext?: (entry: { name: string; content: string }) => void;
  onSummaryUpdate?: (summary: string) => void;
  summaryModel: string;
  calendarFailureText: string;
  promiseFailureText: string;
  stampEmission: (m: ConversationMessage) => Pick<ConversationMessage, "createdAt">;
  signal?: AbortSignal;
}

/** Stream an LLM response and update assistant message state. */
export async function runAssistantChatStream({
  assistantMsgId,
  userMsgId,
  text,
  intent,
  systemPrompt,
  conversationSummary,
  localMessages,
  provider,
  model,
  apiKey,
  baseUrl,
  useWebSearch,
  assistantToolsEnabled,
  wantsPrefetch,
  previousUserContent,
  outboundRingRef,
  setMessages,
  setIsStreaming,
  onToolContext,
  onSummaryUpdate,
  summaryModel,
  calendarFailureText,
  promiseFailureText,
  stampEmission,
  signal,
}: RunAssistantChatStreamParams): Promise<void> {
  let finalSystemPrompt = systemPrompt;
  if (conversationSummary && localMessages.length > 20) {
    finalSystemPrompt =
      `[EARLIER IN THIS CONVERSATION]\n${conversationSummary}\n[END OF EARLIER CONTEXT]\n\n${finalSystemPrompt}`;
  }

  const historyMessages = localMessages.filter(
    (m) =>
      m.id !== userMsgId &&
      m.id !== assistantMsgId &&
      !m.streaming &&
      !m.prefetching &&
      m.content.trim() !== "",
  );
  const history: ChatMessage[] = [
    { role: "system", content: finalSystemPrompt },
    ...getWeightedHistory(historyMessages, intent, 20),
    { role: "user", content: text },
  ];

  outboundRingRef.current = [
    ...outboundRingRef.current.slice(-4),
    {
      sentAt: new Date().toISOString(),
      intent,
      wantsPrefetch,
      previousUserContentPreview: (previousUserContent ?? "").slice(0, 200),
      systemPromptChars: finalSystemPrompt.length,
      outboundMessagesCount: history.length,
      outboundMessages: history,
    },
  ];

  if (assistantToolsEnabled) {
    await relayConnectorTokens();
  }

  let accumulatedText = "";
  let anyToolCalled = false;

  const messagingPlatformForTool = (toolName: string): string => {
    if (toolName === "send_message") return "whatsapp_desktop";
    if (toolName === "whatsapp_messaging") return "whatsapp_cloud";
    return "other";
  };

  await streamAssistantChat({
    model,
    messages: history,
    provider,
    apiKey,
    baseUrl,
    useWebSearch,
    signal,
    onToolCall: (toolName) => {
      anyToolCalled = true;
      trackAssistantToolInvoked(toolName);
      pushExecutionTrace({
        path: "assistant_chat",
        intent,
        toolsCalled: [{ name: toolName, ok: true }],
      });
      if (toolName === "send_message" || toolName === "whatsapp_messaging") {
        trackSendMessageStarted(messagingPlatformForTool(toolName));
      }
      if (!accumulatedText) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `Working: ${toolName}…` } : m,
          ),
        );
      }
    },
    onToolResult: (toolName, ok, content) => {
      pushExecutionTrace({
        path: "assistant_chat",
        intent,
        toolsCalled: [{ name: toolName, ok, summary: content?.slice(0, 120) }],
      });
      if (toolName === "send_message" || toolName === "whatsapp_messaging") {
        const platform = messagingPlatformForTool(toolName);
        if (ok) {
          trackSendMessageCompleted(platform, toolName === "whatsapp_messaging" ? "cloud_api" : "desktop");
        } else {
          trackSendMessageFailed(platform, "tool_failed");
        }
      }
      if (ok && content) onToolContext?.({ name: toolName, content });
    },
    onClientAction: (detail) => {
      dispatchIntegrationClientActionFromSsePayload({
        client_action: {
          action: detail.action,
          provider_id: detail.provider_id,
          provider_label: detail.provider_label,
        },
      });
    },
    onRelay: ({ to, kind, reason }) => {
      if (isFreeTierQuotaError(reason)) {
        showQuotaToast();
        trackProviderError(to, "429_quota", provider);
      }
      if (!accumulatedText) {
        const label = to.charAt(0).toUpperCase() + to.slice(1);
        const relayText =
          kind === "vision" ? `Vision switched to ${label}…` : `Switching to ${label}…`;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: relayText } : m)),
        );
      }
    },
    onDelta: (delta) => {
      accumulatedText += delta;
      const display = toDisplayText(accumulatedText);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: display } : m)),
      );
    },
    onDone: (full) => {
      const raw = toDisplayText(full || accumulatedText) || "Done.";
      const calendarSafe = sanitizeUnbackedCalendarClaim(raw, anyToolCalled, calendarFailureText);
      const display = sanitizeUnbackedPromiseClaim(
        calendarSafe,
        anyToolCalled,
        promiseFailureText,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, ...stampEmission(m), content: display, streaming: false }
            : m,
        ),
      );
      setIsStreaming(false);
      notifyAssistantReplyComplete(display);
      pushExecutionTrace({
        path: "assistant_chat",
        intent,
        toolsCalled: [],
        promiseGuardFired: display !== calendarSafe,
      });

      const msgCount = localMessages.length;
      if (onSummaryUpdate && msgCount > 0 && msgCount % 20 === 0) {
        const historyForSummary = localMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-40)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content.slice(0, 2_000),
          }));
        void streamAssistantChat({
          model: summaryModel,
          provider,
          apiKey,
          baseUrl,
          enableTools: false,
          messages: [
            {
              role: "system",
              content:
                "You are a conversation summariser. Write a concise 3-5 sentence summary of the conversation so far, capturing: the user's main goal, key facts established, decisions made, and last confirmed action. Plain text only. No markdown.",
            },
            ...historyForSummary,
            { role: "user", content: "Summarise this conversation." },
          ],
          onDelta: () => {},
          onDone: (summaryText) => {
            if (summaryText.trim()) onSummaryUpdate(summaryText.trim());
          },
          onError: () => {},
        });
      }
    },
    onError: (err) => {
      trackAssistantTurnFailed("stream_error", provider);
      if (isFreeTierQuotaError(err)) {
        trackProviderError(provider, "429_quota");
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, ...stampEmission(m), content: `⚠ ${err}`, streaming: false }
            : m,
        ),
      );
      setIsStreaming(false);
    },
  });
}
