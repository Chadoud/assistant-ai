import { useState } from "react";
import { toast } from "sonner";
import type { AppSettings } from "../../types/settings";
import SortSystemPromptModal from "../SortSystemPromptModal";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import { useI18n } from "../../i18n/I18nContext";

interface SortInstructionsPromptEditorProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  backendOnline: boolean;
  collapsible?: boolean;
  embedded?: boolean;
}

function promptPreview(text: string, maxLen = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen).trim()}…`;
}

/**
 * Custom sort instructions — shared by Settings and the sort strip.
 */
export function SortInstructionsPromptEditor({
  settings,
  onSettingsPatch,
  backendOnline,
  collapsible = false,
  embedded = false,
}: SortInstructionsPromptEditorProps) {
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);
  const hasCustom = Boolean(settings.sortSystemPrompt.trim());

  const body = embedded ? (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary leading-relaxed">{t("sortInstructionsStrip.customStripHint")}</p>
      {hasCustom ? (
        <blockquote className="rounded-lg border border-border bg-bg-secondary/50 px-3 py-2 text-sm text-text-primary leading-relaxed italic">
          {promptPreview(settings.sortSystemPrompt)}
        </blockquote>
      ) : (
        <p className="text-2xs text-muted">{t("sortInstructionsStrip.customStripEmpty")}</p>
      )}
      <button type="button" onClick={() => setModalOpen(true)} className={`${SECONDARY_BTN_CLASS} text-sm`}>
        {hasCustom ? t("sortInstructionsStrip.customStripEdit") : t("sortInstructionsStrip.customStripWrite")}
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-2xs text-muted leading-relaxed">{t("settings.sortInstructions.hint")}</p>
      <p className="text-2xs text-text-secondary">
        {hasCustom ? t("settings.sortInstructions.customActive") : t("settings.sortInstructions.usingBuiltin")}
      </p>
      <button type="button" onClick={() => setModalOpen(true)} className={`${SECONDARY_BTN_CLASS} text-sm`}>
        {t("settings.sortInstructions.editButton")}
      </button>
    </div>
  );

  return (
    <>
      {collapsible ? (
        <details className="rounded-lg border border-border bg-bg-secondary/30">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-text-primary">
            {t("settings.sortInstructions.expertSummary")}
          </summary>
          <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">{body}</div>
        </details>
      ) : embedded ? (
        body
      ) : (
        <div className="rounded-lg border border-border bg-bg-secondary/30 px-3 py-3 space-y-1">
          <p className="text-sm font-medium text-text-primary">{t("settings.sortInstructions.expertSummary")}</p>
          {body}
        </div>
      )}
      <SortSystemPromptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialValue={settings.sortSystemPrompt}
        onSave={(value) => {
          onSettingsPatch({ sortSystemPrompt: value });
          setModalOpen(false);
          toast.message(t("queue.sortPromptSaved"), { duration: 3500 });
        }}
        backendOnline={backendOnline}
      />
    </>
  );
}
