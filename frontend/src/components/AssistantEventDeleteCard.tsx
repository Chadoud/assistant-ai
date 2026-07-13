/**
 * Inline scope chips for recurring calendar delete confirmation.
 */

import { useState } from "react";
import { confirmCalendarDelete } from "../api/calendar";
import { useI18n } from "../i18n/I18nContext";
import {
  deleteDraftToApiPayload,
  type CalendarDeleteDraft,
  type RecurrenceScope,
} from "../utils/calendarDeleteConfirm";

interface AssistantEventDeleteCardProps {
  draft: CalendarDeleteDraft;
  onComplete: (content: string) => void;
}

const SCOPE_KEYS: Record<RecurrenceScope, string> = {
  this_instance: "assistant.calendarDeleteScopeThis",
  this_and_following: "assistant.calendarDeleteScopeFollowing",
  all_series: "assistant.calendarDeleteScopeAll",
};

export default function AssistantEventDeleteCard({
  draft,
  onComplete,
}: AssistantEventDeleteCardProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const scopes: RecurrenceScope[] =
    draft.scopeOptions ??
    (draft.needsScope
      ? ["this_instance", "this_and_following", "all_series"]
      : []);

  const handleScope = async (scope: RecurrenceScope) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await confirmCalendarDelete({
        draft: deleteDraftToApiPayload(draft),
        scope,
      });
      if (result.status === "deleted") {
        const count = result.deleted_count ?? 1;
        onComplete(
          t("assistant.calendarDeleteDone", { count: String(count) }),
        );
        return;
      }
      if (result.status === "cancelled") {
        onComplete(t("assistant.calendarEventCancelled"));
        return;
      }
      onComplete(result.error ?? t("assistant.calendarDeleteFailed"));
    } catch {
      onComplete(t("assistant.calendarDeleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    await handleScope("this_instance");
  };

  if (!draft.needsScope) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={handleConfirm}
          className="rounded-full border border-accent bg-button-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {t("assistant.calendarDeleteConfirm")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onComplete(t("assistant.calendarEventCancelled"))}
          className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs text-text-primary hover:bg-hover-overlay disabled:opacity-60"
        >
          {t("assistant.calendarDeleteCancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {scopes.map((scope) => (
        <button
          key={scope}
          type="button"
          disabled={busy}
          onClick={() => handleScope(scope)}
          className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-medium text-text-primary transition-colors hover:border-accent hover:bg-hover-overlay disabled:opacity-60"
        >
          {t(SCOPE_KEYS[scope])}
        </button>
      ))}
    </div>
  );
}
