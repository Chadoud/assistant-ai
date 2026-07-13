import type { AssistantTurnJsonResponse } from "../../../api/assistantTurn";
import { startAgentTask } from "../../../api/agentTask";
import { relayConnectorTokens, loadConnectedIntegrationIds } from "../../../assistant/connectorContext";
import { isResumableCodegenSession } from "../../codegen/codegenStore";
import type { ConversationMessage } from "../../../hooks/useConversations";
import {
  extractMailComposeParamsFromText,
  buildMailComposeDeeplinks,
} from "../../../systemCommands/assistantIntentHelpers";
import { calendarDeleteDraftFromTurn } from "../../../utils/calendarDeleteConfirm";
import type { RunAssistantSendMessageParams } from "./assistantSendTypes";

export function applyCompletedTurnMessage(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
): void {
  const { setMessages, stampEmission, setIsStreaming } = params;
  const draft = turn.calendar_event_draft;
  const deleteDraft = turn.calendar_delete_draft;
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            ...stampEmission(m),
            content: turn.assistant_content ?? "",
            streaming: false,
            prefetching: false,
            calendarEventDraft: draft
              ? {
                  title: String(draft.title ?? draft.summary ?? ""),
                  startIso: String(draft.startIso ?? draft.start ?? ""),
                  endIso: String(draft.endIso ?? draft.end ?? ""),
                  sourceText: String(draft.sourceText ?? draft.source_text ?? ""),
                  awaitingConfirm: Boolean(draft.awaitingConfirm),
                  connectedProviderIds: null,
                  toolName: String(draft.toolName ?? draft.tool_name ?? "google_workspace"),
                }
              : undefined,
            calendarDeleteDraft: deleteDraft
              ? calendarDeleteDraftFromTurn(deleteDraft)
              : undefined,
          }
        : m,
    ),
  );
  setIsStreaming(false);
}

export async function handleCodegenStudioAction(
  _turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
  turnId: string,
  userMsg: ConversationMessage,
  localMessages: ConversationMessage[],
): Promise<void> {
  const { setMessages, setIsStreaming, onCodegenStudio } = params;
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            content: "__codegen_studio__",
            codegenGoal: text,
            streaming: false,
            prefetching: false,
          }
        : m,
    ),
  );
  setIsStreaming(false);
  const priorSessionId = [...localMessages]
    .reverse()
    .map((m) => m.codegenSessionId)
    .find((id): id is string => Boolean(id) && isResumableCodegenSession(id!));
  onCodegenStudio({
    text,
    turnId,
    userMsg,
    priorSessionId,
  });
}

export async function handleAgentTaskAction(
  turn: AssistantTurnJsonResponse,
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
): Promise<void> {
  const { setMessages, stampEmission, setIsStreaming, onAgentTaskStarted } = params;
  if (turn.action_payload?.relay_tokens) await relayConnectorTokens();
  try {
    const { task_id } = await startAgentTask({ goal: text });
    onAgentTaskStarted(task_id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: "__agent_task__",
              agentGoal: text.trim(),
              agentTaskId: task_id,
              streaming: false,
              prefetching: false,
            }
          : m,
      ),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Agent task failed.";
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? { ...m, ...stampEmission(m), content: `⚠ ${msg}`, streaming: false }
          : m,
      ),
    );
  }
  setIsStreaming(false);
}

export async function handleMailComposeAction(
  params: RunAssistantSendMessageParams,
  assistantMsgId: string,
  text: string,
): Promise<void> {
  const { setMessages, stampEmission, setIsStreaming, t } = params;
  const connectedIds = await loadConnectedIntegrationIds();
  const { subject, to, body } = extractMailComposeParamsFromText(text);
  const links = buildMailComposeDeeplinks(connectedIds, subject, to, body);
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantMsgId
        ? {
            ...m,
            ...stampEmission(m),
            content: t("assistant.mailComposeNotSupported"),
            prefetching: false,
            streaming: false,
            mailComposeLinks: links,
            mailComposeDraft: {
              subject,
              to,
              body,
              connectedProviderIds: connectedIds ? [...connectedIds] : null,
            },
          }
        : m,
      ),
  );
  setIsStreaming(false);
}
