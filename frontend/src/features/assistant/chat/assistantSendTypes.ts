import type { AppSettings } from "../../../types/settings";
import type { Conversation, ConversationMessage } from "../../../hooks/useConversations";
import type { OutboundChatRecord } from "./AssistantChatPanelCore";
import type { useI18n } from "../../../i18n/I18nContext";

export type TFunction = ReturnType<typeof useI18n>["t"];

export interface RunAssistantSendMessageParams {
  text: string;
  settings: AppSettings;
  conversation: Conversation;
  localMessages: ConversationMessage[];
  memoryBlock: string;
  /** When set, this turn includes a vision image (composer attach). */
  imageAttachment?: { name: string; dataUrl: string };
  /** When set, content is document extract; turn message stays a short prompt. */
  documentAttachment?: {
    name: string;
    text: string;
    pages?: number | null;
    truncated?: boolean;
    source?: string;
    previewDataUrl?: string;
  };
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  setIsStreaming: (v: boolean) => void;
  onDraftClear: () => void;
  onToolContext?: (entry: { name: string; content: string }) => void;
  onSummaryUpdate?: (summary: string) => void;
  outboundRingRef: React.MutableRefObject<OutboundChatRecord[]>;
  stampEmission: (m: ConversationMessage) => Pick<ConversationMessage, "createdAt">;
  t: TFunction;
  signal?: AbortSignal;
  onCodegenStudio: (args: {
    text: string;
    turnId: string;
    userMsg: ConversationMessage;
    priorSessionId?: string;
  }) => void;
  onAgentTaskStarted: (taskId: string, goal: string) => void;
}
