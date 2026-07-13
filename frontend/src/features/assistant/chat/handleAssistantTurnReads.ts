import type { AssistantTurnJsonResponse } from "../../../api/assistantTurn";
import { buildContextForTurn } from "../../../assistant/buildContextFromTurn";
import {
  buildMailRecapSystemPrompt,
  buildMailManageSystemPrompt,
  buildMixedSystemPrompt,
  renderCalendarContext,
} from "../../../systemCommands/assistantPrompts";
import {
  clearAccessGuidanceSessionDismiss,
  dispatchCalendarAccessGuidance,
} from "../../../systemCommands/assistantAccessGuidance";
import { resolveChatProviderCredentials } from "../../../utils/resolveChatProviderCredentials";
import { runAssistantChatStream } from "./assistantChatStreamer";
import type { RunAssistantSendMessageParams } from "./assistantSendTypes";

export async function handleClientCalendarRead(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
  previousUserContent: string | null,
): Promise<void> {
  const { settings, setMessages, stampEmission, setIsStreaming, t } = params;
  const ctx = await buildContextForTurn(turn, text, settings, previousUserContent);
  const formatted = renderCalendarContext(ctx, t);
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? { ...m, ...stampEmission(m), content: formatted, prefetching: false, streaming: false }
        : m,
    ),
  );
  if (ctx.calendarRows.some((r) => r.events.length > 0)) clearAccessGuidanceSessionDismiss();
  dispatchCalendarAccessGuidance(ctx);
  setIsStreaming(false);
}

export async function handleClientMailRead(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  userMsgId: string,
  text: string,
  previousUserContent: string | null,
): Promise<void> {
  const {
    settings,
    memoryBlock,
    conversation,
    localMessages,
    setMessages,
    setIsStreaming,
    onToolContext,
    onSummaryUpdate,
    outboundRingRef,
    stampEmission,
    t,
    signal,
  } = params;

  const ctx = await buildContextForTurn(turn, text, settings, previousUserContent);
  const totalMessages = ctx.mail.reduce((sum, m) => sum + m.messages.length, 0);

  if (turn.intent === "read_mail" && !ctx.anyProviderAttempted) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: t("assistant.mailNoAccountsConnected"),
              prefetching: false,
              streaming: false,
            }
          : m,
      ),
    );
    setIsStreaming(false);
    return;
  }

  if (turn.intent === "read_mail" && totalMessages === 0) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: t("assistant.mailNoMessages"),
              prefetching: false,
              streaming: false,
            }
          : m,
      ),
    );
    setIsStreaming(false);
    return;
  }

  let systemPrompt =
    turn.intent === "read_both"
      ? buildMixedSystemPrompt(ctx, text)
      : buildMailRecapSystemPrompt(ctx, text);
  if (memoryBlock) systemPrompt = `${memoryBlock}\n\n${systemPrompt}`;

  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId ? { ...m, prefetching: false, streaming: true, content: "" } : m,
    ),
  );

  const routing = resolveChatProviderCredentials(settings);
  await runAssistantChatStream({
    assistantMsgId,
    userMsgId,
    text,
    intent: turn.intent as "read_mail" | "read_both",
    systemPrompt,
    conversationSummary: conversation.summary,
    localMessages,
    provider: routing.provider,
    model: routing.model,
    apiKey: routing.apiKey,
    baseUrl: routing.baseUrl,
    useWebSearch: routing.provider === "gemini" && (settings.chatWebSearchEnabled ?? false),
    assistantToolsEnabled: settings.assistantToolsEnabled,
    wantsPrefetch: true,
    previousUserContent,
    outboundRingRef,
    setMessages,
    setIsStreaming,
    onToolContext,
    onSummaryUpdate,
    summaryModel: settings.chatModel,
    calendarFailureText: t("assistant.calendarEventCreateFailed"),
    promiseFailureText: t("assistant.actionPromiseUnfulfilled"),
    stampEmission,
    signal,
  });
}

export async function handleClientMailManage(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  userMsgId: string,
  text: string,
  previousUserContent: string | null,
): Promise<void> {
  const {
    settings,
    memoryBlock,
    conversation,
    localMessages,
    setMessages,
    setIsStreaming,
    onToolContext,
    onSummaryUpdate,
    outboundRingRef,
    stampEmission,
    t,
    signal,
  } = params;

  const ctx = await buildContextForTurn(turn, text, settings, previousUserContent);

  if (!ctx.anyProviderAttempted) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: t("assistant.mailNoAccountsConnected"),
              prefetching: false,
              streaming: false,
            }
          : m,
      ),
    );
    setIsStreaming(false);
    return;
  }

  let systemPrompt = buildMailManageSystemPrompt(ctx, text);
  if (memoryBlock) systemPrompt = `${memoryBlock}\n\n${systemPrompt}`;

  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? { ...m, prefetching: false, streaming: true, content: "", mailManage: true }
        : m,
    ),
  );

  const routing = resolveChatProviderCredentials(settings);
  await runAssistantChatStream({
    assistantMsgId,
    userMsgId,
    text,
    intent: "mail_manage",
    systemPrompt,
    conversationSummary: conversation.summary,
    localMessages,
    provider: routing.provider,
    model: routing.model,
    apiKey: routing.apiKey,
    baseUrl: routing.baseUrl,
    useWebSearch: routing.provider === "gemini" && (settings.chatWebSearchEnabled ?? false),
    assistantToolsEnabled: settings.assistantToolsEnabled,
    wantsPrefetch: true,
    previousUserContent,
    outboundRingRef,
    setMessages,
    setIsStreaming,
    onToolContext,
    onSummaryUpdate,
    summaryModel: settings.chatModel,
    calendarFailureText: t("assistant.calendarEventCreateFailed"),
    promiseFailureText: t("assistant.actionPromiseUnfulfilled"),
    stampEmission,
    signal,
  });
}
