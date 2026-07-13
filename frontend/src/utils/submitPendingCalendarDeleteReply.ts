import { confirmCalendarDelete } from "../api/calendar";
import type { ConversationMessage } from "../hooks/useConversations";
import { makeId } from "../hooks/useConversations";
import {
  calendarDeleteDraftFromTurn,
  deleteDraftToApiPayload,
  type CalendarDeleteDraft,
} from "./calendarDeleteConfirm";
import { calendarDeleteDraftToSyncPayload } from "./calendarDeleteDraftFromToolResult";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

interface SubmitPendingCalendarDeleteReplyParams {
  text: string;
  draft: CalendarDeleteDraft;
  localMessages: ConversationMessage[];
  setMessages: (
    updater: ConversationMessage[] | ((prev: ConversationMessage[]) => ConversationMessage[]),
  ) => void;
  onDraftClear: () => void;
  t: TranslateFn;
}

function assistantContentForDeleteResult(
  result: Awaited<ReturnType<typeof confirmCalendarDelete>>,
  t: TranslateFn,
): string {
  if (result.status === "deleted") {
    const count = result.deleted_count ?? 1;
    return t("assistant.calendarDeleteDone", { count: String(count) });
  }
  if (result.status === "cancelled") {
    return t("assistant.calendarEventCancelled");
  }
  if (result.status === "needs_scope" && result.recap) {
    return result.recap;
  }
  if (result.status === "needs_confirmation" && result.recap) {
    return result.recap;
  }
  return result.error ?? t("assistant.calendarDeleteFailed");
}

/**
 * Route composer text to confirm-delete when a pending delete draft exists.
 * Returns whether the reply was consumed and whether delete confirmation is still pending.
 */
export async function submitPendingCalendarDeleteReply(
  params: SubmitPendingCalendarDeleteReplyParams,
): Promise<{
  consumed: boolean;
  stillPending: boolean;
  syncDraft: Record<string, unknown> | null;
}> {
  const { text, draft, localMessages, setMessages, onDraftClear, t } = params;
  const trimmed = text.trim();
  if (!trimmed) return { consumed: false, stillPending: true, syncDraft: null };

  const pendingMsg = [...localMessages]
    .reverse()
    .find((m) => m.role === "assistant" && m.calendarDeleteDraft?.awaitingConfirm);
  const assistantMsgId = pendingMsg?.id ?? makeId();
  const userMsgId = makeId();

  const result = await confirmCalendarDelete({
    draft: deleteDraftToApiPayload(draft),
    user_reply: trimmed,
  });

  const assistantContent = assistantContentForDeleteResult(result, t);
  const stillPending =
    result.status === "needs_scope" || result.status === "needs_confirmation";
  const deleteDraft =
    stillPending && result.draft
      ? calendarDeleteDraftFromTurn({
          ...result.draft,
          needsScope: result.status === "needs_scope",
          scopeOptions: result.scope_options,
          awaitingConfirm: true,
        })
      : undefined;

  setMessages((prev) => {
    const hasPendingAssistant = prev.some((m) => m.id === assistantMsgId);
    const base = hasPendingAssistant
      ? prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: assistantContent,
                calendarDeleteDraft: deleteDraft,
              }
            : m,
        )
      : prev.concat({
          id: assistantMsgId,
          role: "assistant" as const,
          content: assistantContent,
          createdAt: new Date().toISOString(),
          calendarDeleteDraft: deleteDraft,
        });

    const last = base[base.length - 1];
    if (last?.role === "user" && last.content.trim() === trimmed) {
      return base;
    }
    return base.concat({
      id: userMsgId,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
      voiceSource: "typed",
    });
  });

  onDraftClear();
  return {
    consumed: true,
    stillPending,
    syncDraft:
      stillPending && deleteDraft ? calendarDeleteDraftToSyncPayload(deleteDraft) : null,
  };
}
