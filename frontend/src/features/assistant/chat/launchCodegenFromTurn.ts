import { hasCodegenConsent } from "../../../components/CodegenConsentModal";
import {
  codegenCredentialsMessageKey,
  describeCodegenCredentialsIssue,
} from "../../codegen/codegenCredentialsPreflight";
import { beginCodegenStudioUi, clearPendingCodegenLaunch, launchCodegenSession } from "../../codegen/codegenStore";
import { resolveChatProviderCredentials } from "../../../utils/resolveChatProviderCredentials";
import type { AppSettings } from "../../../types/settings";
import type { ConversationMessage } from "../../../hooks/useConversations";
import type { PendingCodegen } from "./useCodegenConsent";

function stampEmission(m: ConversationMessage): Pick<ConversationMessage, "createdAt"> {
  return m.createdAt ? {} : { createdAt: new Date().toISOString() };
}

export async function launchCodegenFromTurn(args: {
  text: string;
  turnId: string;
  studioMsgId?: string;
  settings: AppSettings;
  priorSessionId?: string;
  t: (key: string) => string;
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  pendingRef: React.MutableRefObject<PendingCodegen | null>;
  setConsentOpen: (open: boolean) => void;
}): Promise<void> {
  const studioMsgId = args.studioMsgId ?? `${args.turnId}-assistant`;
  const followUp = Boolean(args.priorSessionId) && args.text.length < 1200;
  beginCodegenStudioUi(args.text);

  const failStudioMessage = (message: string) => {
    clearPendingCodegenLaunch();
    args.setMessages((prev) =>
      prev.map((m) =>
        m.id === studioMsgId
          ? { ...m, ...stampEmission(m), content: message, codegenGoal: undefined }
          : m,
      ),
    );
  };

  const runStudio = async () => {
    const credentialsIssue = describeCodegenCredentialsIssue(args.settings);
    if (credentialsIssue) {
      failStudioMessage(args.t(codegenCredentialsMessageKey(credentialsIssue)));
      return;
    }
    const routing = resolveChatProviderCredentials(args.settings);
    const sessionId = await launchCodegenSession({
      goal: args.text,
      provider: routing.provider,
      model: routing.model,
      apiKey: routing.apiKey,
      baseUrl: routing.baseUrl,
      followUp,
      priorSessionId: args.priorSessionId,
    });
    args.setMessages((prev) =>
      prev.map((m) => (m.id === studioMsgId ? { ...m, codegenSessionId: sessionId } : m)),
    );
  };

  try {
    if (!hasCodegenConsent()) {
      args.pendingRef.current = {
        text: args.text,
        studioMsgId,
        followUp,
        priorSessionId: args.priorSessionId,
      };
      args.setConsentOpen(true);
      return;
    }
    await runStudio();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to start codegen session.";
    failStudioMessage(message);
  }
}
