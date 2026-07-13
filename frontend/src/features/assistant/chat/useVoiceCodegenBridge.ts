/**
 * Bridges voice-triggered Codegen Studio into the chat transcript + launch pipeline.
 */

import { useCallback, useEffect, useRef } from "react";
import { VOICE_CODEGEN_START_EVENT } from "../../../constants";
import type { AppSettings } from "../../../types/settings";
import { isCodegenTask } from "../../../systemCommands/assistantIntentHelpers";
import { makeId, type ConversationMessage } from "../../../hooks/useConversations";
import { isResumableCodegenSession } from "../../codegen/codegenStore";
import { launchCodegenFromTurn } from "./launchCodegenFromTurn";
import type { PendingCodegen } from "./useCodegenConsent";
import type { VoiceTurnCommitMeta } from "./commitAssistantTurn";
import {
  assistantSpokeCodegenStudioIntent,
  resolveVoiceCodegenFallbackGoal,
  shouldLaunchVoiceCodegenFallback,
} from "./voiceCodegenFallback";

interface UseVoiceCodegenBridgeParams {
  settings: AppSettings;
  t: (key: string) => string;
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  pendingCodegenRef: React.MutableRefObject<PendingCodegen | null>;
  setConsentOpen: (open: boolean) => void;
  localMessages: ConversationMessage[];
}

function recentCodegenUserUtterances(messages: ConversationMessage[]): string[] {
  return messages
    .filter((m) => m.role === "user" && isCodegenTask(m.content))
    .map((m) => m.content.trim())
    .slice(-5);
}

/** When voice invokes Codegen Studio, show the in-chat progress card and start the build. */
export function useVoiceCodegenBridge({
  settings,
  t,
  setMessages,
  pendingCodegenRef,
  setConsentOpen,
  localMessages,
}: UseVoiceCodegenBridgeParams): { onAfterVoiceTurnCommitted: (input: {
  userText: string;
  assistantText: string;
  meta: VoiceTurnCommitMeta | null;
}) => void } {
  const localMessagesRef = useRef(localMessages);
  localMessagesRef.current = localMessages;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const tRef = useRef(t);
  tRef.current = t;

  const startVoiceCodegen = useCallback(
    (goal: string, replaceSpokenAck = false) => {
      const trimmed = goal.trim();
      if (!trimmed) return;
      if (!window.electronAPI?.codegenRunInstall) return;

      const turnId = makeId();
      const priorSessionId = [...localMessagesRef.current]
        .reverse()
        .map((m) => m.codegenSessionId)
        .find((id): id is string => Boolean(id) && isResumableCodegenSession(id!));

      const lastCommitted = localMessagesRef.current[localMessagesRef.current.length - 1];
      const replaceLastAck =
        replaceSpokenAck &&
        lastCommitted?.role === "assistant" &&
        assistantSpokeCodegenStudioIntent(lastCommitted.content) &&
        !lastCommitted.codegenGoal;
      const studioMsgId = replaceLastAck ? lastCommitted.id : `${turnId}-assistant`;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content === "__codegen_studio__" && last.codegenGoal === trimmed) {
          return prev;
        }
        if (replaceLastAck && last?.id === studioMsgId) {
          return prev.slice(0, -1).concat({
            ...last,
            content: "__codegen_studio__",
            codegenGoal: trimmed,
          });
        }
        return prev.concat({
          id: studioMsgId,
          role: "assistant",
          content: "__codegen_studio__",
          codegenGoal: trimmed,
          createdAt: new Date().toISOString(),
        });
      });

      void launchCodegenFromTurn({
        text: trimmed,
        turnId,
        studioMsgId,
        settings: settingsRef.current,
        t: tRef.current,
        priorSessionId,
        setMessages,
        pendingRef: pendingCodegenRef,
        setConsentOpen,
      });
    },
    [pendingCodegenRef, setConsentOpen, setMessages],
  );

  const onAfterVoiceTurnCommitted = useCallback(
    (input: { userText: string; assistantText: string; meta: VoiceTurnCommitMeta | null }) => {
      const recentGoals = recentCodegenUserUtterances(localMessagesRef.current);
      if (
        !shouldLaunchVoiceCodegenFallback(
          input.userText,
          input.assistantText,
          input.meta,
          recentGoals,
        )
      ) {
        return;
      }
      const goal = resolveVoiceCodegenFallbackGoal(
        input.userText,
        input.assistantText,
        recentGoals,
      );
      if (!goal) return;
      startVoiceCodegen(goal, assistantSpokeCodegenStudioIntent(input.assistantText));
    },
    [startVoiceCodegen],
  );

  useEffect(() => {
    const onVoiceCodegen = (ev: Event) => {
      const goal = (ev as CustomEvent<{ goal?: string }>).detail?.goal?.trim();
      if (!goal) return;
      startVoiceCodegen(goal, false);
    };

    window.addEventListener(VOICE_CODEGEN_START_EVENT, onVoiceCodegen);
    return () => window.removeEventListener(VOICE_CODEGEN_START_EVENT, onVoiceCodegen);
  }, [startVoiceCodegen]);

  return { onAfterVoiceTurnCommitted };
}
