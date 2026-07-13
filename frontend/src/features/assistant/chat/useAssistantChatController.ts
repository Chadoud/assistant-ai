/**
 * Thin controller for the assistant chat panel — delegates routing to POST /assistant/turn.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSettings } from "../../../types/settings";
import type { UseVoiceSessionReturn } from "../../../hooks/useVoiceSession";
import { isChatReady } from "../../../utils/chatReadiness";
import { messageNeedsLocalAppService } from "../../../utils/messageNeedsLocalAppService";
import { runCloudOnlyAssistantMessage } from "./runCloudOnlyAssistantMessage";
import { useVoiceBackendReady } from "../../../hooks/useVoiceBackendReady";
import { setActiveConversationId } from "../../../systemCommands/activeConversationRef";
import { setActivePlanTask } from "../plan/planStore";
import {
  formatMailManageToolOutcome,
  isMailManageToolResult,
  upsertAgentTaskMessage,
  watchPlanTaskCompletion,
} from "./agentTaskChatHelpers";
import {
  makeId,
  normalizeConversationMessages,
  conversationPersistedMessagesEqual,
  type Conversation,
  type ConversationMessage,
  type ConversationToolContext,
} from "../../../hooks/useConversations";
import { buildDebugPayload, downloadJson } from "./assistantDebugExport";
import { getLastConnectTrace } from "../../../assistant/integrationTokenRelay";
import { ASSISTANT_TOOL_FOLLOWUP_READY_EVENT } from "../../../constants";
import { pushExecutionTrace } from "./assistantExecutionTrace";
import { useI18n } from "../../../i18n/I18nContext";
import type { OutboundChatRecord } from "./AssistantChatPanelCore";
import { useVoiceTurnCommitter } from "./voiceTurnCommitter";
import { useVoiceCodegenBridge } from "./useVoiceCodegenBridge";
import { runAssistantSendMessage } from "./runAssistantSendMessage";
import { useCodegenConsentHandlers, type PendingCodegen } from "./useCodegenConsent";
import { launchCodegenFromTurn } from "./launchCodegenFromTurn";
import { isResumableCodegenSession } from "../../codegen/codegenStore";
import { useAssistantChatMemory } from "./useAssistantChatMemory";
import { pendingCalendarDeleteDraftUi } from "./assistantSendHelpers";
import { submitPendingCalendarDeleteReply } from "../../../utils/submitPendingCalendarDeleteReply";
import type { CalendarDeleteDraft } from "../../../utils/calendarDeleteConfirm";
import {
  attachCalendarDeleteDraftToMessages,
  calendarDeleteDraftFromToolResult,
  calendarDeleteDraftToSyncPayload,
} from "../../../utils/calendarDeleteDraftFromToolResult";

function stampEmission(m: ConversationMessage): Pick<ConversationMessage, "createdAt"> {
  return m.createdAt ? {} : { createdAt: new Date().toISOString() };
}

interface UseAssistantChatControllerParams {
  voice: UseVoiceSessionReturn;
  conversation: Conversation;
  onConversationChange: (msgs: ConversationMessage[]) => void;
  onToolContext?: (entry: ConversationToolContext) => void;
  settings: AppSettings;
  backendOnline: boolean;
  onSummaryUpdate?: (summary: string) => void;
  onDraftClear: () => void;
}

export function useAssistantChatController({
  voice,
  conversation,
  onConversationChange,
  onToolContext,
  settings,
  backendOnline,
  onSummaryUpdate,
  onDraftClear,
}: UseAssistantChatControllerParams) {
  const { t } = useI18n();
  const [localMessages, setLocalMessages] = useState<ConversationMessage[]>(() =>
    normalizeConversationMessages(conversation.messages),
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [codegenConsentOpen, setCodegenConsentOpen] = useState(false);
  const voiceReady = useVoiceBackendReady(settings, backendOnline);
  const memoryBlock = useAssistantChatMemory(conversation.id, settings, backendOnline);
  const pendingCodegenRef = useRef<PendingCodegen | null>(null);
  const pendingVoiceDeleteDraftRef = useRef<CalendarDeleteDraft | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(localMessages);
  messagesRef.current = localMessages;
  const outboundRingRef = useRef<OutboundChatRecord[]>([]);
  const planWatchCleanupRef = useRef<Map<string, () => void>>(new Map());
  const onConversationChangeRef = useRef(onConversationChange);
  onConversationChangeRef.current = onConversationChange;

  useEffect(() => {
    setLocalMessages(normalizeConversationMessages(conversation.messages));
  }, [conversation.id]);

  useEffect(() => {
    setActiveConversationId(conversation.id);
    return () => setActiveConversationId(undefined);
  }, [conversation.id]);

  const setMessages = useCallback(
    (updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[])) => {
      setLocalMessages((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [],
  );

  const { onAfterVoiceTurnCommitted } = useVoiceCodegenBridge({
    settings,
    t,
    setMessages,
    pendingCodegenRef,
    setConsentOpen: setCodegenConsentOpen,
    localMessages,
  });

  useVoiceTurnCommitter({
    voice,
    messagesRef,
    setLocalMessages,
    pendingVoiceDeleteDraftRef,
    onAfterVoiceTurnCommitted,
  });

  useEffect(() => {
    voice.setOnToolResult((payload) => {
      const draft = calendarDeleteDraftFromToolResult(payload.tool, payload.result);
      if (draft) {
        pendingVoiceDeleteDraftRef.current = draft;
        voice.sendPendingCalendarDeleteSync(calendarDeleteDraftToSyncPayload(draft));
        setLocalMessages((prev) => attachCalendarDeleteDraftToMessages(prev, draft));
        return;
      }
      if (payload.tool === "google_workspace" && isMailManageToolResult(payload.result)) {
        const outcome = formatMailManageToolOutcome(payload.tool, payload.result);
        if (outcome) {
          setLocalMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              content: outcome,
              createdAt: new Date().toISOString(),
              voiceSource: "google_workspace",
            },
          ]);
        }
      }
    });
    return () => voice.setOnToolResult(null);
  }, [voice, setLocalMessages]);

  useEffect(() => {
    voice.setOnToolRunning((payload) => {
      if (!payload.planTaskId || !payload.planGoal) return;
      setActivePlanTask(payload.planTaskId, payload.planGoal);
      setLocalMessages((prev) =>
        upsertAgentTaskMessage(prev, payload.planTaskId!, payload.planGoal!, makeId),
      );
      const watches = planWatchCleanupRef.current;
      if (!watches.has(payload.planTaskId)) {
        const unsub = watchPlanTaskCompletion(payload.planTaskId, payload.planGoal, (outcome) => {
          setLocalMessages((prev) => [
            ...prev,
            {
              id: makeId(),
              role: "assistant",
              content: outcome,
              createdAt: new Date().toISOString(),
              voiceSource: "plan_and_execute",
            },
          ]);
          watches.delete(payload.planTaskId!);
        });
        watches.set(payload.planTaskId, unsub);
      }
    });
    return () => voice.setOnToolRunning(null);
  }, [voice, setLocalMessages]);

  useEffect(() => {
    return () => {
      for (const unsub of planWatchCleanupRef.current.values()) unsub();
      planWatchCleanupRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onFollowup = (ev: Event) => {
      const detail = (ev as CustomEvent<{ commandId?: string; ok?: boolean; result?: unknown }>).detail;
      pushExecutionTrace({
        path: "ipc",
        toolsCalled: [
          {
            name: detail?.commandId ?? "exosites-action",
            ok: detail?.ok === true,
          },
        ],
      });
    };
    window.addEventListener(ASSISTANT_TOOL_FOLLOWUP_READY_EVENT, onFollowup as EventListener);
    return () =>
      window.removeEventListener(ASSISTANT_TOOL_FOLLOWUP_READY_EVENT, onFollowup as EventListener);
  }, []);

  const pendingDeleteDraftForSync = useMemo(
    () => pendingCalendarDeleteDraftUi(localMessages),
    [localMessages],
  );
  const pendingDeleteSyncKey = useMemo(() => {
    if (!pendingDeleteDraftForSync) return "";
    return JSON.stringify(calendarDeleteDraftToSyncPayload(pendingDeleteDraftForSync));
  }, [pendingDeleteDraftForSync]);

  useEffect(() => {
    if (!voice.isListening) return;
    voice.sendPendingCalendarDeleteSync(
      pendingDeleteDraftForSync
        ? calendarDeleteDraftToSyncPayload(pendingDeleteDraftForSync)
        : null,
    );
  }, [voice.isListening, pendingDeleteSyncKey, voice, pendingDeleteDraftForSync]);


  useEffect(() => {
    const persisted = localMessages.filter((m) => !m.streaming && !m.prefetching);
    if (conversationPersistedMessagesEqual(conversation.messages, persisted)) return;
    onConversationChangeRef.current(persisted);
  }, [localMessages, conversation.messages]);

  const { approveCodegenConsent, denyCodegenConsent } = useCodegenConsentHandlers(
    settings,
    setMessages,
    pendingCodegenRef,
    setCodegenConsentOpen,
    t("assistant.codegen.consentDenied"),
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || !isChatReady(settings)) return;

      const pendingDelete = pendingCalendarDeleteDraftUi(localMessages);
      if (pendingDelete) {
        const outcome = await submitPendingCalendarDeleteReply({
          text,
          draft: pendingDelete,
          localMessages,
          setMessages,
          onDraftClear,
          t,
        });
        if (outcome.consumed) {
          voice.sendPendingCalendarDeleteSync(outcome.syncDraft);
        }
        return;
      }

      if (voice.isListening) {
        const trimmed = text.trim();
        voice.sendText(trimmed);
        onDraftClear();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user" && last.content.trim() === trimmed) return prev;
          return prev.concat({
            id: makeId(),
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
            voiceSource: "typed",
          });
        });
        return;
      }
      if (!backendOnline) {
        voice.interruptBriefing();
        if (messageNeedsLocalAppService(text, settings)) {
          const turnId = makeId();
          setMessages((prev) =>
            prev.concat(
              {
                id: `${turnId}-user`,
                role: "user",
                content: text.trim(),
                createdAt: new Date().toISOString(),
              },
              {
                id: `${turnId}-assistant`,
                role: "assistant",
                content: t("chat.localServiceRequiredMessage"),
                createdAt: new Date().toISOString(),
                localAppServiceHint: true,
              },
            ),
          );
          onDraftClear();
          return;
        }

        abortRef.current?.abort();
        const abort = new AbortController();
        abortRef.current = abort;
        await runCloudOnlyAssistantMessage({
          text,
          settings,
          localMessages,
          setMessages,
          setIsStreaming,
          onDraftClear,
          signal: abort.signal,
        });
        return;
      }

      voice.interruptBriefing();
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const result = await runAssistantSendMessage({
        text,
        settings,
        conversation,
        localMessages,
        memoryBlock,
        setMessages,
        setIsStreaming,
        onDraftClear,
        onToolContext,
        onSummaryUpdate,
        outboundRingRef,
        stampEmission,
        t,
        signal: abort.signal,
        onCodegenStudio: ({ text: goal, turnId }) => {
          void launchCodegenFromTurn({
            text: goal,
            turnId,
            settings,
            t,
            priorSessionId: [...localMessages]
              .reverse()
              .map((m) => m.codegenSessionId)
              .find((id): id is string => Boolean(id) && isResumableCodegenSession(id!)),
            setMessages,
            pendingRef: pendingCodegenRef,
            setConsentOpen: setCodegenConsentOpen,
          });
        },
        onAgentTaskStarted: (taskId) => {
          const goal = text.trim();
          setActivePlanTask(taskId, goal);
          if (!planWatchCleanupRef.current.has(taskId)) {
            const unsub = watchPlanTaskCompletion(taskId, goal, (outcome) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: makeId(),
                  role: "assistant",
                  content: outcome,
                  createdAt: new Date().toISOString(),
                  voiceSource: "plan_and_execute",
                },
              ]);
              planWatchCleanupRef.current.delete(taskId);
            });
            planWatchCleanupRef.current.set(taskId, unsub);
          }
        },
      });

      if (!result.ok) {
        setMessages((prev) =>
          prev.concat({
            id: makeId(),
            role: "assistant",
            content: result.reason,
            createdAt: new Date().toISOString(),
          }),
        );
      }
    },
    [
      backendOnline,
      conversation,
      localMessages,
      memoryBlock,
      onDraftClear,
      onSummaryUpdate,
      onToolContext,
      settings,
      setMessages,
      voice,
      t,
    ],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming || m.prefetching
          ? { ...m, streaming: false, prefetching: false, ...stampEmission(m) }
          : m,
      ),
    );
  }, [setMessages]);

  const handleDebugExport = useCallback(() => {
    const isoSafe = new Date().toISOString().replace(/[:.]/g, "-");
    const streamingMsg = localMessages.find((m) => m.streaming || m.prefetching);
    downloadJson(
      `assistant-debug-${conversation.id.slice(0, 8)}-${isoSafe}.json`,
      buildDebugPayload({
        conversation,
        settings,
        memoryBlock,
        voiceSnapshot: {
          isListening: voice.isListening,
          isReconnecting: voice.isReconnecting,
          inputTranscript: voice.inputTranscript,
          outputTranscript: voice.outputTranscript,
        },
        localMessages,
        outboundRing: outboundRingRef.current,
        voiceTurnTraces: voice.voiceTurnTraces,
        connectTrace: getLastConnectTrace(),
        controllerState: {
          isStreaming,
          activeAssistantMessageId: streamingMsg?.id ?? null,
        },
      }),
    );
  }, [conversation, settings, memoryBlock, voice, localMessages, isStreaming]);

  return {
    localMessages,
    isStreaming,
    voiceReady,
    memoryBlock,
    outboundRingRef,
    sendMessage,
    handleStop,
    handleDebugExport,
    codegenConsentOpen,
    approveCodegenConsent,
    denyCodegenConsent,
    voiceTurnTraces: voice.voiceTurnTraces,
  };
}
