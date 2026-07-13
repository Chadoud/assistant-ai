/** Codegen consent modal handlers extracted from the chat controller. */

import { useCallback } from "react";
import { grantCodegenConsent } from "../../../components/CodegenConsentModal";
import { clearPendingCodegenLaunch, launchCodegenSession } from "../../codegen/codegenStore";
import { resolveChatProviderCredentials } from "../../../utils/resolveChatProviderCredentials";
import type { AppSettings } from "../../../types/settings";
import type { ConversationMessage } from "../../../hooks/useConversations";

function stampEmission(m: ConversationMessage): Pick<ConversationMessage, "createdAt"> {
  return m.createdAt ? {} : { createdAt: new Date().toISOString() };
}

export interface PendingCodegen {
  text: string;
  studioMsgId: string;
  followUp: boolean;
  priorSessionId?: string;
}

export function useCodegenConsentHandlers(
  settings: AppSettings,
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void,
  pendingRef: React.MutableRefObject<PendingCodegen | null>,
  setConsentOpen: (open: boolean) => void,
  denyText: string,
) {
  const approveCodegenConsent = useCallback(
    (scope: "session" | "always") => {
      grantCodegenConsent(scope);
      setConsentOpen(false);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;
      void (async () => {
        try {
          const routing = resolveChatProviderCredentials(settings);
          const sessionId = await launchCodegenSession({
            goal: pending.text,
            provider: routing.provider,
            model: routing.model,
            apiKey: routing.apiKey,
            baseUrl: routing.baseUrl,
            followUp: pending.followUp,
            priorSessionId: pending.priorSessionId,
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pending.studioMsgId ? { ...m, codegenSessionId: sessionId } : m,
            ),
          );
        } catch (e: unknown) {
          clearPendingCodegenLaunch();
          const message = e instanceof Error ? e.message : "Failed to start codegen session.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pending.studioMsgId
                ? { ...m, ...stampEmission(m), content: message, codegenGoal: undefined }
                : m,
            ),
          );
        }
      })();
    },
    [pendingRef, setConsentOpen, setMessages, settings],
  );

  const denyCodegenConsent = useCallback(() => {
    setConsentOpen(false);
    clearPendingCodegenLaunch();
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === pending.studioMsgId
          ? {
              ...m,
              ...stampEmission(m),
              content: denyText,
              codegenGoal: undefined,
            }
          : m,
      ),
    );
  }, [denyText, pendingRef, setConsentOpen, setMessages]);

  return { approveCodegenConsent, denyCodegenConsent };
}
