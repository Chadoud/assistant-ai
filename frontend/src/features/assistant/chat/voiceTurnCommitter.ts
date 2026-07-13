/**
 * Voice turn commit hook — wraps commitAssistantTurn for the chat controller.
 */

import { useCallback, useEffect, useRef } from "react";
import type { UseVoiceSessionReturn } from "../../../hooks/useVoiceSession";
import { makeId, type ConversationMessage } from "../../../hooks/useConversations";
import { appendVoiceTurnMessages } from "./commitAssistantTurn";
import type { VoiceTurnCommitMeta } from "./commitAssistantTurn";
import { VOICE_ASSISTANT_ECHO_LOOKBACK } from "../../../utils/voiceTranscriptQuality";
import type { CalendarDeleteDraft } from "../../../utils/calendarDeleteConfirm";

interface UseVoiceTurnCommitterParams {
  voice: UseVoiceSessionReturn;
  messagesRef: React.MutableRefObject<ConversationMessage[]>;
  setLocalMessages: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
  pendingVoiceDeleteDraftRef?: React.MutableRefObject<CalendarDeleteDraft | null>;
  onAfterVoiceTurnCommitted?: (input: {
    userText: string;
    assistantText: string;
    meta: VoiceTurnCommitMeta | null;
  }) => void;
}

/** Wire voice turn_complete and session-end commits into chat messages. */
export function useVoiceTurnCommitter({
  voice,
  messagesRef,
  setLocalMessages,
  pendingVoiceDeleteDraftRef,
  onAfterVoiceTurnCommitted,
}: UseVoiceTurnCommitterParams): void {
  const prevVoiceInputRef = useRef("");
  const prevVoiceOutputRef = useRef("");
  const briefingEndedAtRef = useRef<number | null>(null);
  const wasBriefingActiveRef = useRef(false);
  const briefingRunIdRef = useRef<string | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    if (voice.briefingSection) {
      if (!briefingRunIdRef.current) briefingRunIdRef.current = makeId();
      wasBriefingActiveRef.current = true;
      return;
    }
    if (wasBriefingActiveRef.current) {
      briefingEndedAtRef.current = Date.now();
      wasBriefingActiveRef.current = false;
      briefingRunIdRef.current = null;
    }
  }, [voice.briefingSection]);

  const voiceUserCommitContext = () => ({
    briefingActive: voiceRef.current.briefingSection !== null,
    msSinceBriefingEnded: briefingEndedAtRef.current
      ? Date.now() - briefingEndedAtRef.current
      : Number.POSITIVE_INFINITY,
  });

  const onAfterVoiceTurnCommittedRef = useRef(onAfterVoiceTurnCommitted);
  onAfterVoiceTurnCommittedRef.current = onAfterVoiceTurnCommitted;

  const appendVoiceTurnToChat = useCallback(
    (input: string, output: string) => {
      const turnMeta = voiceRef.current.consumeTurnCommitMeta();
      const server = turnMeta.serverTurn;
      const userText = server ? (server.userCommitted ? server.userText : "") : input;
      const assistantText = server?.assistantText ?? output;
      const recentAssistant = messagesRef.current
        .filter((m) => m.role === "assistant")
        .slice(-VOICE_ASSISTANT_ECHO_LOOKBACK)
        .map((m) => m.content);
      const pendingDeleteDraft = pendingVoiceDeleteDraftRef?.current ?? null;
      if (pendingVoiceDeleteDraftRef) {
        pendingVoiceDeleteDraftRef.current = null;
      }

      setLocalMessages((prev) =>
        appendVoiceTurnMessages(prev, {
          userText,
          assistantText,
          meta: turnMeta,
          briefingRunId: briefingRunIdRef.current,
          recentAssistantLines: recentAssistant,
          userCommitContext: voiceUserCommitContext(),
          makeMessageId: makeId,
          calendarDeleteDraft: pendingDeleteDraft,
        }),
      );

      onAfterVoiceTurnCommittedRef.current?.({
        userText,
        assistantText,
        meta: turnMeta,
      });
    },
    [messagesRef, setLocalMessages],
  );

  useEffect(() => {
    voice.setOnTurnComplete((payload) => {
      if (!payload.assistantText && !payload.userCommitted) return;
      appendVoiceTurnToChat(payload.userCommitted ? payload.userText : "", payload.assistantText);
      prevVoiceInputRef.current = "";
      prevVoiceOutputRef.current = "";
    });
    return () => voice.setOnTurnComplete(null);
  }, [voice, appendVoiceTurnToChat]);

  useEffect(() => {
    if (voice.isListening) return;
    const input = prevVoiceInputRef.current;
    const output = prevVoiceOutputRef.current;
    if (!input && !output) return;
    prevVoiceInputRef.current = "";
    prevVoiceOutputRef.current = "";
    appendVoiceTurnToChat(input, output);
  }, [voice.isListening, appendVoiceTurnToChat]);
}
